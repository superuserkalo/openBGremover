package middleware

import (
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/errors"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
)

// RateLimiter implements a simple in-memory token bucket rate limiter
type RateLimiter struct {
	config  *config.Config
	buckets map[string]*bucket
	mutex   sync.RWMutex
	cleanup chan struct{}
}

// bucket represents a token bucket for rate limiting
type bucket struct {
	tokens       int
	capacity     int
	refillRate   int           // tokens per second
	lastRefill   time.Time
	mutex        sync.Mutex
}

// NewRateLimiter creates a new rate limiter
func NewRateLimiter(cfg *config.Config) *RateLimiter {
	rl := &RateLimiter{
		config:  cfg,
		buckets: make(map[string]*bucket),
		cleanup: make(chan struct{}),
	}

	// Start cleanup goroutine
	go rl.cleanupExpiredBuckets()

	return rl
}

// Middleware returns a Gin middleware function for rate limiting
func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip rate limiting in development or if disabled
		if !rl.config.Features.EnableRateLimit || rl.config.IsDevelopment() {
			c.Next()
			return
		}

		// Get client identifier (IP address or user ID)
		clientID := rl.getClientID(c)
		
		// Check rate limit
		if !rl.allowRequest(clientID) {
			logger.FromGinContext(c).LogRateLimit(clientID, c.Request.URL.Path)
			c.Error(errors.ErrRateLimit)
			c.Abort()
			return
		}

		c.Next()
	}
}

// getClientID extracts a client identifier for rate limiting
func (rl *RateLimiter) getClientID(c *gin.Context) string {
	// Try to get user ID from context (more specific)
	if userID, exists := c.Get("userID"); exists {
		return "user:" + userID.(string)
	}

	// Fall back to IP address
	return "ip:" + c.ClientIP()
}

// allowRequest checks if a request should be allowed
func (rl *RateLimiter) allowRequest(clientID string) bool {
	rl.mutex.RLock()
	b, exists := rl.buckets[clientID]
	rl.mutex.RUnlock()

	if !exists {
		// Create new bucket
		b = &bucket{
			capacity:   100, // 100 requests
			refillRate: 10,  // 10 requests per second
			tokens:     100, // Start with full bucket
			lastRefill: time.Now(),
		}
		
		rl.mutex.Lock()
		rl.buckets[clientID] = b
		rl.mutex.Unlock()
	}

	return b.consume(1)
}

// consume attempts to consume tokens from the bucket
func (b *bucket) consume(tokens int) bool {
	b.mutex.Lock()
	defer b.mutex.Unlock()

	// Refill tokens based on elapsed time
	now := time.Now()
	elapsed := now.Sub(b.lastRefill)
	tokensToAdd := int(elapsed.Seconds()) * b.refillRate
	
	if tokensToAdd > 0 {
		b.tokens = min(b.capacity, b.tokens+tokensToAdd)
		b.lastRefill = now
	}

	// Check if we have enough tokens
	if b.tokens >= tokens {
		b.tokens -= tokens
		return true
	}

	return false
}

// cleanupExpiredBuckets removes old buckets to prevent memory leaks
func (rl *RateLimiter) cleanupExpiredBuckets() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rl.mutex.Lock()
			now := time.Now()
			for clientID, bucket := range rl.buckets {
				// Remove buckets that haven't been used in 10 minutes
				if now.Sub(bucket.lastRefill) > 10*time.Minute {
					delete(rl.buckets, clientID)
				}
			}
			rl.mutex.Unlock()
		case <-rl.cleanup:
			return
		}
	}
}

// Close shuts down the rate limiter
func (rl *RateLimiter) Close() {
	close(rl.cleanup)
}

// Helper function for min (since Go doesn't have it built-in for ints)
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}