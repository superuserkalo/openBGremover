package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/services"
)

// HealthHandler handles health check and API info requests
type HealthHandler struct {
	config    *config.Config
	bgService *services.BackgroundRemovalService
	startTime time.Time
}

// NewHealthHandler creates a new health handler
func NewHealthHandler(cfg *config.Config, bgService *services.BackgroundRemovalService, startTime time.Time) *HealthHandler {
	return &HealthHandler{
		config:    cfg,
		bgService: bgService,
		startTime: startTime,
	}
}

// HandleHealth returns health check information
func (h *HealthHandler) HandleHealth(c *gin.Context) {
	health := gin.H{
		"status":                   "healthy",
		"service":                  "background-removal-gateway",
		"version":                  "2.0.0",
		"environment":              h.config.Environment,
		"timestamp":                time.Now().Unix(),
		"beam_endpoint_configured": h.config.Beam.EndpointURL != "",
		"uptime_seconds":           time.Since(h.startTime).Seconds(),
		"max_file_size_mb":         h.config.Server.MaxFileSize / (1 << 20),
		"timeout_seconds":          h.config.Beam.Timeout.Seconds(),
		"features": gin.H{
			"api_keys":      h.config.Features.EnableAPIKeys,
			"rate_limiting": h.config.Features.EnableRateLimit,
			"compression":   h.config.Features.EnableCompression,
			"metrics":       h.config.Features.EnableMetrics,
			"tracing":       h.config.Features.EnableTracing,
		},
	}

	c.JSON(http.StatusOK, health)
}

// HandleAPIInfo returns API information for SDK discovery
func (h *HealthHandler) HandleAPIInfo(c *gin.Context) {
	info := gin.H{
		"service_name": "Background Removal API",
		"version":      "2.0.0",
		"endpoints": gin.H{
			"remove_background": "/api/v1/remove-background",
			"legacy_upload":     "/v1/remove-background",
			"health":            "/health",
			"api_info":          "/api/info",
			"user_stats":        "/api/v1/stats",
			"user_activity":     "/api/v1/activity",
			"api_keys":          "/api/v1/keys",
		},
		"supported_formats": h.bgService.GetSupportedFormats(),
		"quality_presets":   h.bgService.GetQualityPresets(),
		"max_file_size_mb":  h.config.Server.MaxFileSize / (1 << 20),
		"timeout_seconds":   h.config.Beam.Timeout.Seconds(),
		"features": []string{
			"static_images",
			"animated_gifs",
			"custom_resizing",
			"mask_output",
			"multiple_formats",
			"input_validation",
			"timeout_handling",
			"user_management",
			"api_keys",
			"usage_tracking",
			"rate_limiting",
		},
		"sdk_support": []string{
			"python", "go", "rust", "javascript", "csharp", "cpp",
		},
		"authentication": gin.H{
			"jwt_supported":     true,
			"api_key_supported": h.config.Features.EnableAPIKeys,
		},
	}

	c.JSON(http.StatusOK, info)
}

// HandleRoot handles the root endpoint
func (h *HealthHandler) HandleRoot(c *gin.Context) {
	c.String(http.StatusOK, "Background Removal API Gateway v2.0.0 - Ready!\nDocs: /api/info\nHealth: /health")
}

// HandleNotFound handles 404 errors
func (h *HealthHandler) HandleNotFound(c *gin.Context) {
	c.JSON(http.StatusNotFound, gin.H{
		"success":    false,
		"error":      "Endpoint not found",
		"error_code": "NOT_FOUND",
	})
}