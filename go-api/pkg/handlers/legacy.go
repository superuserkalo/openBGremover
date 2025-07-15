package handlers

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/errors"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/models"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/services"
)

// LegacyHandler handles legacy multipart/form-data requests
type LegacyHandler struct {
	config    *config.Config
	bgService *services.BackgroundRemovalService
}

// NewLegacyHandler creates a new legacy handler
func NewLegacyHandler(cfg *config.Config, bgService *services.BackgroundRemovalService) *LegacyHandler {
	return &LegacyHandler{
		config:    cfg,
		bgService: bgService,
	}
}

// HandleLegacyUpload handles legacy multipart/form-data uploads
func (h *LegacyHandler) HandleLegacyUpload(c *gin.Context) {
	// Get uploaded file
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		if err == http.ErrMissingFile {
			c.Error(errors.NewAPIError("MISSING_FILE", "No image file provided", http.StatusBadRequest))
		} else {
			c.Error(errors.NewAPIError("FILE_ERROR", fmt.Sprintf("Failed to get file: %v", err), http.StatusBadRequest))
		}
		return
	}
	defer func() {
		if closeErr := file.Close(); closeErr != nil {
			log.Printf("Error closing file: %v", closeErr)
		}
	}()

	// Validate file size
	if header.Size > h.config.Server.MaxFileSize {
		c.Error(errors.NewAPIError("FILE_TOO_LARGE", 
			fmt.Sprintf("File too large (max %dMB)", h.config.Server.MaxFileSize/(1<<20)), 
			http.StatusBadRequest))
		return
	}

	// Validate content type
	if !h.isValidImageType(header.Header) {
		c.Error(errors.NewAPIError("INVALID_FILE_TYPE", "Invalid file type. Only images are allowed", http.StatusBadRequest))
		return
	}

	// Read file and encode to base64
	imageBytes, err := io.ReadAll(file)
	if err != nil {
		c.Error(errors.NewAPIError("FILE_READ_ERROR", "Failed to read image", http.StatusBadRequest))
		return
	}

	// Get and validate form values
	quality := c.DefaultPostForm("quality", "auto")
	format := c.DefaultPostForm("format", "png")

	// Create API request
	apiReq := &models.APIRequest{
		ImageData: base64.StdEncoding.EncodeToString(imageBytes),
		Quality:   quality,
		Format:    format,
	}

	// Process the image
	response, err := h.bgService.ProcessImage(c.Request.Context(), apiReq)
	if err != nil {
		c.Error(err)
		return
	}

	if !response.Success {
		c.JSON(http.StatusBadRequest, gin.H{"error": response.Error})
		return
	}

	// Return raw image for legacy compatibility
	imageData, err := h.decodeBase64(response.ResultImage)
	if err != nil {
		c.Error(errors.NewAPIError("DECODE_ERROR", "Failed to decode result", http.StatusInternalServerError))
		return
	}

	// Set proper content type based on format
	contentType := h.getContentType(format)
	c.Data(http.StatusOK, contentType, imageData)
}

// isValidImageType validates the image content type
func (h *LegacyHandler) isValidImageType(header map[string][]string) bool {
	contentTypes := header["Content-Type"]
	if len(contentTypes) == 0 {
		return false
	}

	validTypes := []string{
		"image/jpeg",
		"image/jpg",
		"image/png",
		"image/gif",
		"image/webp",
	}

	for _, ct := range contentTypes {
		for _, valid := range validTypes {
			if strings.HasPrefix(strings.ToLower(ct), valid) {
				return true
			}
		}
	}
	return false
}

// getContentType returns the appropriate content type for a format
func (h *LegacyHandler) getContentType(format string) string {
	switch format {
	case "jpg", "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	case "gif":
		return "image/gif"
	default:
		return "image/png"
	}
}

// decodeBase64 decodes base64 data (with or without data URL prefix)
func (h *LegacyHandler) decodeBase64(data string) ([]byte, error) {
	// Handle data URLs and plain base64
	if strings.HasPrefix(data, "data:") {
		parts := strings.Split(data, ",")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid data URL")
		}
		data = parts[1]
	}

	decoded, err := base64.StdEncoding.DecodeString(data)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64: %w", err)
	}

	return decoded, nil
}