package middleware

import (
	"bytes"
	"crypto/md5"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/cache"
)

// ResponseWriter wraps gin.ResponseWriter to capture response data
type ResponseWriter struct {
	gin.ResponseWriter
	body       *bytes.Buffer
	statusCode int
}

// Write captures the response body
func (r *ResponseWriter) Write(data []byte) (int, error) {
	r.body.Write(data)
	return r.ResponseWriter.Write(data)
}

// WriteHeader captures the status code
func (r *ResponseWriter) WriteHeader(statusCode int) {
	r.statusCode = statusCode
	r.ResponseWriter.WriteHeader(statusCode)
}

// CacheMiddleware creates a caching middleware
func CacheMiddleware(cache *cache.MemoryCache, ttl time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only cache GET requests
		if c.Request.Method != "GET" {
			c.Next()
			return
		}

		// Generate cache key based on URL and query parameters
		cacheKey := generateCacheKey(c.Request.URL.String())

		// Try to get from cache
		if cachedData, found := cache.Get(cacheKey); found {
			c.Header("X-Cache", "HIT")
			c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d", int(ttl.Seconds())))
			c.Data(http.StatusOK, "application/json", cachedData)
			c.Abort()
			return
		}

		// Wrap the response writer to capture output
		responseWriter := &ResponseWriter{
			ResponseWriter: c.Writer,
			body:           &bytes.Buffer{},
			statusCode:     200,
		}
		c.Writer = responseWriter

		// Process the request
		c.Next()

		// Cache the response if it was successful
		if responseWriter.statusCode == http.StatusOK && responseWriter.body.Len() > 0 {
			cache.Set(cacheKey, responseWriter.body.Bytes(), ttl)
			c.Header("X-Cache", "MISS")
			c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d", int(ttl.Seconds())))
		}
	}
}

// generateCacheKey generates a cache key from the URL
func generateCacheKey(url string) string {
	hash := md5.Sum([]byte(url))
	return fmt.Sprintf("%x", hash)
}