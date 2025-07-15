package logger

import (
	"context"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
)

// ContextKey type for context keys
type ContextKey string

const (
	// RequestIDKey is the key for request ID in context
	RequestIDKey ContextKey = "request_id"
	// UserIDKey is the key for user ID in context
	UserIDKey ContextKey = "user_id"
)

// Logger wraps zerolog with additional functionality
type Logger struct {
	*zerolog.Logger
}

// Setup initializes the global logger
func Setup(cfg *config.Config) *Logger {
	// Configure zerolog
	if cfg.IsDevelopment() {
		// Pretty logging for development
		log.Logger = log.Output(zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: time.RFC3339,
		})
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	} else {
		// JSON logging for production
		zerolog.SetGlobalLevel(zerolog.InfoLevel)
	}

	// Enable debug logging if configured
	if cfg.Features.EnableDebugLogging {
		zerolog.SetGlobalLevel(zerolog.DebugLevel)
	}

	// Add service information to all logs
	logger := log.With().
		Str("service", "background-removal-gateway").
		Str("version", "2.0.0").
		Str("environment", cfg.Environment).
		Logger()

	return &Logger{&logger}
}

// WithRequestID adds request ID to the logger context
func (l *Logger) WithRequestID(requestID string) *Logger {
	logger := l.With().Str("request_id", requestID).Logger()
	return &Logger{&logger}
}

// WithUserID adds user ID to the logger context
func (l *Logger) WithUserID(userID string) *Logger {
	logger := l.With().Str("user_id", userID).Logger()
	return &Logger{&logger}
}

// WithFields adds multiple fields to the logger context
func (l *Logger) WithFields(fields map[string]interface{}) *Logger {
	event := l.With()
	for key, value := range fields {
		event = event.Interface(key, value)
	}
	logger := event.Logger()
	return &Logger{&logger}
}

// FromContext extracts logger with context information
func FromContext(ctx context.Context) *Logger {
	logger := log.Logger

	// Add request ID if available
	if requestID, ok := ctx.Value(RequestIDKey).(string); ok && requestID != "" {
		logger = logger.With().Str("request_id", requestID).Logger()
	}

	// Add user ID if available
	if userID, ok := ctx.Value(UserIDKey).(string); ok && userID != "" {
		logger = logger.With().Str("user_id", userID).Logger()
	}

	return &Logger{&logger}
}

// FromGinContext extracts logger with Gin context information
func FromGinContext(c *gin.Context) *Logger {
	logger := log.Logger

	// Add request ID if available
	if requestID := c.GetString("request_id"); requestID != "" {
		logger = logger.With().Str("request_id", requestID).Logger()
	}

	// Add user ID if available
	if userID := c.GetString("userID"); userID != "" {
		logger = logger.With().Str("user_id", userID).Logger()
	}

	// Add additional request information
	logger = logger.With().
		Str("method", c.Request.Method).
		Str("path", c.Request.URL.Path).
		Str("client_ip", c.ClientIP()).
		Logger()

	return &Logger{&logger}
}

// LogAPICall logs an API call with common fields
func (l *Logger) LogAPICall(method, path string, statusCode int, duration time.Duration, userID string) {
	l.Info().
		Str("method", method).
		Str("path", path).
		Int("status_code", statusCode).
		Dur("duration_ms", duration).
		Str("user_id", userID).
		Msg("API call completed")
}

// LogError logs an error with context
func (l *Logger) LogError(err error, msg string, fields map[string]interface{}) {
	event := l.Error().Err(err)
	for key, value := range fields {
		event = event.Interface(key, value)
	}
	event.Msg(msg)
}

// LogUsage logs usage information
func (l *Logger) LogUsage(userID, source, creditType string, success bool, processingTime time.Duration) {
	l.Info().
		Str("user_id", userID).
		Str("source", source).
		Str("credit_type", creditType).
		Bool("success", success).
		Dur("processing_time", processingTime).
		Msg("Usage logged")
}

// LogAuth logs authentication events
func (l *Logger) LogAuth(userID, method string, success bool, reason string) {
	event := l.Info().
		Str("user_id", userID).
		Str("auth_method", method).
		Bool("success", success)
	
	if reason != "" {
		event = event.Str("reason", reason)
	}
	
	event.Msg("Authentication attempt")
}

// LogRateLimit logs rate limiting events
func (l *Logger) LogRateLimit(clientID, endpoint string) {
	l.Warn().
		Str("client_id", clientID).
		Str("endpoint", endpoint).
		Msg("Rate limit exceeded")
}

// Global logger instance
var globalLogger *Logger

// SetGlobalLogger sets the global logger instance
func SetGlobalLogger(logger *Logger) {
	globalLogger = logger
}

// GetGlobalLogger returns the global logger instance
func GetGlobalLogger() *Logger {
	if globalLogger == nil {
		// Fallback to basic logger
		logger := log.Logger
		globalLogger = &Logger{&logger}
	}
	return globalLogger
}