package validation

import (
	"encoding/base64"
	"fmt"
	"regexp"
	"strings"

	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/errors"
)

// ValidateImageData validates base64 image data
func ValidateImageData(imageData string) error {
	if imageData == "" {
		return errors.NewAPIError("EMPTY_IMAGE_DATA", "Image data is required", 400)
	}

	// Check if it's a valid data URL or base64
	if strings.HasPrefix(imageData, "data:") {
		parts := strings.Split(imageData, ",")
		if len(parts) != 2 {
			return errors.NewAPIError("INVALID_DATA_URL", "Invalid data URL format", 400)
		}
		
		// Validate MIME type
		if !strings.Contains(parts[0], "image/") {
			return errors.NewAPIError("INVALID_MIME_TYPE", "Only image data URLs are supported", 400)
		}
		
		imageData = parts[1]
	}

	// Try to decode base64 to validate
	decoded, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		return errors.NewAPIError("INVALID_BASE64", "Invalid base64 encoding", 400)
	}

	// Check minimum size (at least 100 bytes for a valid image)
	if len(decoded) < 100 {
		return errors.NewAPIError("IMAGE_TOO_SMALL", "Image data appears to be too small", 400)
	}

	// Check maximum size (50MB encoded)
	if len(decoded) > 50*1024*1024 {
		return errors.NewAPIError("IMAGE_TOO_LARGE", "Image data exceeds maximum size limit", 400)
	}

	// Basic image format validation by checking magic bytes
	if !hasValidImageMagicBytes(decoded) {
		return errors.NewAPIError("INVALID_IMAGE_FORMAT", "Data does not appear to be a valid image", 400)
	}

	return nil
}

// ValidateQuality validates quality parameter
func ValidateQuality(quality string) error {
	if quality == "" {
		return nil // Empty is allowed (will use default)
	}

	validQualities := []string{"auto", "quality", "portrait", "product", "speed"}
	for _, v := range validQualities {
		if quality == v {
			return nil
		}
	}

	return errors.NewAPIError("INVALID_QUALITY", 
		fmt.Sprintf("Quality must be one of: %s", strings.Join(validQualities, ", ")), 400)
}

// ValidateFormat validates format parameter
func ValidateFormat(format string) error {
	if format == "" {
		return nil // Empty is allowed (will use default)
	}

	validFormats := []string{"png", "jpg", "jpeg", "webp", "gif"}
	for _, v := range validFormats {
		if strings.ToLower(format) == v {
			return nil
		}
	}

	return errors.NewAPIError("INVALID_FORMAT", 
		fmt.Sprintf("Format must be one of: %s", strings.Join(validFormats, ", ")), 400)
}

// ValidateAPIKeyName validates API key name
func ValidateAPIKeyName(name string) error {
	if name == "" {
		return errors.NewAPIError("EMPTY_KEY_NAME", "API key name is required", 400)
	}

	// Check length
	if len(name) < 3 || len(name) > 50 {
		return errors.NewAPIError("INVALID_KEY_NAME_LENGTH", 
			"API key name must be between 3 and 50 characters", 400)
	}

	// Check for valid characters (alphanumeric, spaces, hyphens, underscores)
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9\s\-_]+$`, name)
	if !matched {
		return errors.NewAPIError("INVALID_KEY_NAME_CHARS", 
			"API key name can only contain letters, numbers, spaces, hyphens, and underscores", 400)
	}

	return nil
}

// ValidatePaginationParams validates pagination parameters
func ValidatePaginationParams(limit, offset int) error {
	if limit < 1 || limit > 100 {
		return errors.NewAPIError("INVALID_LIMIT", "Limit must be between 1 and 100", 400)
	}

	if offset < 0 {
		return errors.NewAPIError("INVALID_OFFSET", "Offset must be non-negative", 400)
	}

	return nil
}

// hasValidImageMagicBytes checks if the data starts with valid image magic bytes
func hasValidImageMagicBytes(data []byte) bool {
	if len(data) < 8 {
		return false
	}

	// PNG: 89 50 4E 47 0D 0A 1A 0A
	if len(data) >= 8 && 
		data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 &&
		data[4] == 0x0D && data[5] == 0x0A && data[6] == 0x1A && data[7] == 0x0A {
		return true
	}

	// JPEG: FF D8 FF
	if len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return true
	}

	// GIF87a: 47 49 46 38 37 61
	if len(data) >= 6 && 
		data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 &&
		data[3] == 0x38 && data[4] == 0x37 && data[5] == 0x61 {
		return true
	}

	// GIF89a: 47 49 46 38 39 61
	if len(data) >= 6 && 
		data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 &&
		data[3] == 0x38 && data[4] == 0x39 && data[5] == 0x61 {
		return true
	}

	// WebP: 52 49 46 46 [4 bytes] 57 45 42 50
	if len(data) >= 12 && 
		data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 &&
		data[8] == 0x57 && data[9] == 0x45 && data[10] == 0x42 && data[11] == 0x50 {
		return true
	}

	return false
}