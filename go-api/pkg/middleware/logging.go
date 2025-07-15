package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
)

// RequestID generates and adds a unique request ID to each request
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := generateRequestID()
		c.Set("request_id", requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

// StructuredLogging replaces the default Gin logger with structured logging
func StructuredLogging() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		method := c.Request.Method
		clientIP := c.ClientIP()
		userAgent := c.Request.UserAgent()
		requestID := c.GetString("request_id")

		// Process request
		c.Next()

		// Log request completion
		duration := time.Since(start)
		statusCode := c.Writer.Status()
		bodySize := c.Writer.Size()

		// Get logger with context
		log := logger.GetGlobalLogger().WithRequestID(requestID)

		// Add user ID if available
		if userID := c.GetString("userID"); userID != "" {
			log = log.WithUserID(userID)
		}

		// Build log entry
		fields := map[string]interface{}{
			"method":      method,
			"path":        path,
			"status_code": statusCode,
			"duration_ms": duration.Milliseconds(),
			"client_ip":   clientIP,
			"user_agent":  userAgent,
			"body_size":   bodySize,
		}

		if raw != "" {
			fields["query"] = raw
		}

		// Add error information if present
		if len(c.Errors) > 0 {
			fields["errors"] = c.Errors.String()
		}

		// Log with appropriate level based on status code
		message := "Request completed"
		if statusCode >= 500 {
			log.WithFields(fields).Error().Msg(message)
		} else if statusCode >= 400 {
			log.WithFields(fields).Warn().Msg(message)
		} else {
			log.WithFields(fields).Info().Msg(message)
		}
	}
}

// generateRequestID generates a unique request ID
func generateRequestID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to timestamp if random generation fails
		return hex.EncodeToString([]byte(time.Now().Format("20060102150405")))
	}
	return hex.EncodeToString(bytes)
}