package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
    "github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
    "github.com/superuserkalo/OpenBGRemover/go-api/errors"
)

// ErrorHandler handles API errors and returns proper JSON responses
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		// Check if there are any errors
		if len(c.Errors) > 0 {
			err := c.Errors.Last().Err

			// Check if it's an APIError
			if apiErr, ok := err.(*errors.APIError); ok {
				c.JSON(apiErr.StatusCode, gin.H{
					"success":    false,
					"error":      apiErr.Message,
					"error_code": apiErr.Code,
				})
				return
			}

			// Check if it's a ValidationErrors
			if validationErr, ok := err.(*errors.ValidationErrors); ok {
				c.JSON(http.StatusBadRequest, gin.H{
					"success":    false,
					"error":      "Validation failed",
					"error_code": "VALIDATION_ERROR",
					"details":    validationErr.Errors,
				})
				return
			}

			// Generic error
			c.JSON(http.StatusInternalServerError, gin.H{
				"success":    false,
				"error":      "Internal server error",
				"error_code": "INTERNAL_ERROR",
			})
		}
	}
}

// RequestLogger creates a custom logging middleware
func RequestLogger() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return fmt.Sprintf("[%s] %s - \"%s %s %s\" %d %s %s \"%s\" %s\n",
			param.TimeStamp.Format("2006/01/02 15:04:05"),
			param.ClientIP,
			param.Method,
			param.Path,
			param.Request.Proto,
			param.StatusCode,
			param.Latency,
			param.Request.Header.Get("Content-Length"),
			param.Request.UserAgent(),
			param.ErrorMessage,
		)
	})
}

// RequestSizeLimit creates a middleware that limits request size
func RequestSizeLimit(maxSize int64) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > maxSize {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"success":    false,
				"error":      fmt.Sprintf("Request too large (max %dMB)", maxSize/(1<<20)),
				"error_code": "REQUEST_TOO_LARGE",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// Timeout creates a middleware that adds timeout to requests
func Timeout(timeout time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()
		
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}

// Security creates a middleware that adds security headers
func Security() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "1; mode=block")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Next()
	}
}

// CreateRateLimiter creates a rate limiter middleware
func CreateRateLimiter(config *config.Config) gin.HandlerFunc {
	rateLimiter := NewRateLimiter(config)
	return rateLimiter.Middleware()
}

// Compression creates a middleware that compresses responses
func Compression(config *config.Config) gin.HandlerFunc {
	// Skip compression if disabled
	if !config.Features.EnableCompression {
		return func(c *gin.Context) {
			c.Next()
		}
	}

	// Return the gzip middleware
	return gzip.Gzip(gzip.DefaultCompression)
}
