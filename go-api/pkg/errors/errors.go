package errors

import (
	"fmt"
	"net/http"
)

// APIError represents a structured API error
type APIError struct {
	Code       string `json:"error_code"`
	Message    string `json:"error"`
	StatusCode int    `json:"-"`
}

func (e *APIError) Error() string {
	return e.Message
}

// NewAPIError creates a new API error
func NewAPIError(code, message string, statusCode int) *APIError {
	return &APIError{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
	}
}

// Common API errors
var (
	ErrInvalidRequest      = NewAPIError("INVALID_REQUEST", "Invalid request format", http.StatusBadRequest)
	ErrInvalidImageData    = NewAPIError("INVALID_IMAGE_DATA", "Invalid image data format", http.StatusBadRequest)
	ErrInvalidQuality      = NewAPIError("INVALID_QUALITY", "Invalid quality parameter", http.StatusBadRequest)
	ErrInvalidFormat       = NewAPIError("INVALID_FORMAT", "Invalid format parameter", http.StatusBadRequest)
	ErrUnauthorized        = NewAPIError("UNAUTHORIZED", "Authentication required", http.StatusUnauthorized)
	ErrInvalidToken        = NewAPIError("INVALID_TOKEN", "Invalid authentication token", http.StatusUnauthorized)
	ErrInvalidAPIKey       = NewAPIError("INVALID_API_KEY", "Invalid API key", http.StatusUnauthorized)
	ErrInsufficientCredits = NewAPIError("INSUFFICIENT_CREDITS", "Insufficient credits", http.StatusPaymentRequired)
	ErrTimeout             = NewAPIError("TIMEOUT", "Request timeout", http.StatusRequestTimeout)
	ErrTooLarge            = NewAPIError("REQUEST_TOO_LARGE", "Request too large", http.StatusRequestEntityTooLarge)
	ErrRateLimit           = NewAPIError("RATE_LIMIT_EXCEEDED", "Rate limit exceeded", http.StatusTooManyRequests)
	ErrInternalServer      = NewAPIError("INTERNAL_ERROR", "Internal server error", http.StatusInternalServerError)
	ErrBeamWorker          = NewAPIError("BEAM_ERROR", "Background removal service error", http.StatusInternalServerError)
	ErrProcessingFailed    = NewAPIError("PROCESSING_ERROR", "Image processing failed", http.StatusBadRequest)
)

// ValidationError represents field validation errors
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationErrors represents multiple validation errors
type ValidationErrors struct {
	Errors []ValidationError `json:"validation_errors"`
}

func (v *ValidationErrors) Error() string {
	return fmt.Sprintf("validation failed: %d errors", len(v.Errors))
}

// AddError adds a validation error
func (v *ValidationErrors) AddError(field, message string) {
	v.Errors = append(v.Errors, ValidationError{
		Field:   field,
		Message: message,
	})
}

// HasErrors returns true if there are validation errors
func (v *ValidationErrors) HasErrors() bool {
	return len(v.Errors) > 0
}

// NewValidationErrors creates a new validation errors collection
func NewValidationErrors() *ValidationErrors {
	return &ValidationErrors{
		Errors: make([]ValidationError, 0),
	}
}