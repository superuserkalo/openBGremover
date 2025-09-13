package handlers

import (
    "context"
    "net/http"
    "time"
    "encoding/base64"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/errors"
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

    // Check if request is using a service (trial) key
    isService := false
    if v, ok := c.Get("isServiceKey"); ok {
        if b, ok2 := v.(bool); ok2 {
            isService = b
        }
    }

    // Get identifiers from context
    userIDVal, hasUser := c.Get("userID")
    apiKeyID, _ := c.Get("apiKeyID")

    // Determine source
    source := "ui"
    if apiKeyID != nil {
        source = "api"
    }
    if isService {
        source = "trial"
    }

    // For non-service requests, decrement user credits; for service, skip
    var creditType string
    if !isService {
        if !hasUser {
            c.Error(errors.ErrUnauthorized)
            return
        }
        uid := userIDVal.(string)
        var err error
        creditType, err = h.db.DecrementCredits(c.Request.Context(), uid)
        if err != nil {
            c.Error(errors.ErrInsufficientCredits)
            h.logUsage(c.Request.Context(), uid, apiKeyID, source, false, "Insufficient credits", 0, "")
            return
        }
    }

    // Parse request
    var apiReq models.APIRequest
    if err := c.ShouldBindJSON(&apiReq); err != nil {
        c.Error(errors.NewAPIError("INVALID_REQUEST", err.Error(), http.StatusBadRequest))
        if !isService && hasUser {
            h.logUsage(c.Request.Context(), userIDVal.(string), apiKeyID, source, false, "Invalid JSON request", 0, creditType)
        }
        return
    }

    // Force PNG output for service (trial) requests
    if isService {
        apiReq.Format = "png"
    }

    // Process image
    response, err := h.bgService.ProcessImage(c.Request.Context(), &apiReq)
    if err != nil {
        c.Error(err)
        if !isService && hasUser {
            h.logUsage(c.Request.Context(), userIDVal.(string), apiKeyID, source, false, err.Error(), 0, creditType)
        }
        return
    }

    // Debug: log returned image length (development only)
    if response != nil && response.Success {
        logger.FromGinContext(c).WithFields(map[string]interface{}{
            "result_image_len": len(response.ResultImage),
            "mask_image_len":   len(response.MaskImage),
        }).Info().Msg("Background removal result sizes")
    }

	// Log usage
	processingTime := time.Since(startTime).Milliseconds()
	success := response != nil && response.Success
	errorMsg := ""
	if response != nil && !response.Success {
		errorMsg = response.Error
	}

    if isService {
        // For trial/service requests, return binary image to minimize payload overhead
        imgB64 := response.ResultImage
        if imgB64 == "" && response.MaskImage != "" {
            imgB64 = response.MaskImage
        }
        data, decErr := base64.StdEncoding.DecodeString(imgB64)
        if decErr != nil {
            c.Error(errors.NewAPIError("DECODE_ERROR", "Failed to decode processed image", http.StatusInternalServerError))
            return
        }
        // Always return PNG for trial path
        c.Data(http.StatusOK, "image/png", data)
        return
    }

    if !isService && hasUser {
        h.logUsage(c.Request.Context(), userIDVal.(string), apiKeyID, source, success, errorMsg, int(processingTime), creditType)
    }

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
