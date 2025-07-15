package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/errors"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/models"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/services"
	"github.com/superuserkalo/OpenBGRemover/go-api/database"
)

// BackgroundRemovalHandler handles background removal requests
type BackgroundRemovalHandler struct {
	bgService *services.BackgroundRemovalService
	db        *database.DB
}

// NewBackgroundRemovalHandler creates a new handler
func NewBackgroundRemovalHandler(bgService *services.BackgroundRemovalService, db *database.DB) *BackgroundRemovalHandler {
	return &BackgroundRemovalHandler{
		bgService: bgService,
		db:        db,
	}
}

// HandleRemoveBackground handles the main background removal endpoint
func (h *BackgroundRemovalHandler) HandleRemoveBackground(c *gin.Context) {
	startTime := time.Now()

	// Get user info from middleware
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	apiKeyID, _ := c.Get("apiKeyID")

	// Determine source
	source := "ui"
	if apiKeyID != nil {
		source = "api"
	}

	// Decrement credits before processing
	creditType, err := h.db.DecrementCredits(c.Request.Context(), userID.(string))
	if err != nil {
		c.Error(errors.ErrInsufficientCredits)
		h.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, "Insufficient credits", 0, "")
		return
	}

	// Parse request
	var apiReq models.APIRequest
	if err := c.ShouldBindJSON(&apiReq); err != nil {
		c.Error(errors.NewAPIError("INVALID_REQUEST", err.Error(), http.StatusBadRequest))
		h.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, "Invalid JSON request", 0, creditType)
		return
	}

	// Process image
	response, err := h.bgService.ProcessImage(c.Request.Context(), &apiReq)
	if err != nil {
		c.Error(err)
		h.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, err.Error(), 0, creditType)
		return
	}

	// Log usage
	processingTime := time.Since(startTime).Milliseconds()
	success := response != nil && response.Success
	errorMsg := ""
	if response != nil && !response.Success {
		errorMsg = response.Error
	}

	h.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, success, errorMsg, int(processingTime), creditType)

	c.JSON(http.StatusOK, response)
}

// logUsage creates a usage log entry
func (h *BackgroundRemovalHandler) logUsage(ctx context.Context, userID string, apiKeyID interface{}, source string, success bool, errorMsg string, processingTimeMs int, creditType string) {
	var apiKeyPtr *int64
	if apiKeyID != nil {
		if id, ok := apiKeyID.(*int64); ok {
			apiKeyPtr = id
		}
	}

	var errorMsgPtr *string
	if errorMsg != "" {
		errorMsgPtr = &errorMsg
	}

	var processingTimeMsPtr *int
	if processingTimeMs > 0 {
		processingTimeMsPtr = &processingTimeMs
	}

	var creditTypePtr *string
	if creditType != "" {
		creditTypePtr = &creditType
	}

	logEntry := &database.UsageLog{
		UserID:           userID,
		APIKeyID:         apiKeyPtr,
		Source:           source,
		WasSuccessful:    success,
		ErrorMessage:     errorMsgPtr,
		ProcessingTimeMs: processingTimeMsPtr,
		CreditTypeUsed:   creditTypePtr,
	}

	if err := h.db.CreateUsageLog(ctx, logEntry); err != nil {
		logger.FromContext(ctx).LogError(err, "Failed to create usage log", map[string]interface{}{
			"user_id": userID,
			"source":  source,
		})
	} else {
		// Log successful usage tracking
		logger.FromContext(ctx).LogUsage(userID, source, creditType, success, time.Duration(processingTimeMs)*time.Millisecond)
	}
}