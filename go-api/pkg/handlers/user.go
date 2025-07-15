package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/auth"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/errors"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/models"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/validation"
	"github.com/superuserkalo/OpenBGRemover/go-api/database"
)

// UserHandler handles user-related requests
type UserHandler struct {
	db *database.DB
}

// NewUserHandler creates a new user handler
func NewUserHandler(db *database.DB) *UserHandler {
	return &UserHandler{
		db: db,
	}
}

// HandleStats returns user statistics
func (h *UserHandler) HandleStats(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	stats, err := h.db.GetUserStats(c.Request.Context(), userID.(string))
	if err != nil {
		c.Error(errors.NewAPIError("STATS_ERROR", "Failed to get user statistics", http.StatusInternalServerError))
		return
	}

	// Extract profile information
	profile, ok := stats["profile"].(*database.Profile)
	if !ok {
		c.Error(errors.ErrInternalServer)
		return
	}

	response := models.StatsResponse{
		Success:           true,
		ImagesProcessed:   stats["images_processed"].(int),
		ImagesThisMonth:   stats["images_this_month"].(int),
		FreeCredits:       profile.FreeImagesRemaining,
		BulkCredits:       profile.BulkImagesRemaining,
		BillingModel:      profile.CurrentBillingModel,
	}

	c.JSON(http.StatusOK, response)
}

// HandleActivity returns user activity with pagination
func (h *UserHandler) HandleActivity(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	// Parse pagination parameters
	limit := 50
	offset := 0

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		} else {
			c.Error(errors.NewAPIError("INVALID_LIMIT", "Limit must be a valid integer", http.StatusBadRequest))
			return
		}
	}

	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil {
			offset = parsed
		} else {
			c.Error(errors.NewAPIError("INVALID_OFFSET", "Offset must be a valid integer", http.StatusBadRequest))
			return
		}
	}

	// Validate pagination parameters
	if err := validation.ValidatePaginationParams(limit, offset); err != nil {
		c.Error(err)
		return
	}

	activities, err := h.db.GetUserActivity(c.Request.Context(), userID.(string), limit, offset)
	if err != nil {
		c.Error(errors.NewAPIError("ACTIVITY_ERROR", "Failed to get user activity", http.StatusInternalServerError))
		return
	}

	// Convert to response format
	activityEntries := make([]models.ActivityEntry, len(activities))
	for i, activity := range activities {
		entry := models.ActivityEntry{
			ID:            activity.ID,
			Source:        activity.Source,
			WasSuccessful: activity.WasSuccessful,
			CreatedAt:     activity.CreatedAt.Unix(),
		}

		if activity.ErrorMessage != nil {
			entry.ErrorMessage = *activity.ErrorMessage
		}
		if activity.ProcessingTimeMs != nil {
			entry.ProcessingTimeMs = *activity.ProcessingTimeMs
		}
		if activity.CreditTypeUsed != nil {
			entry.CreditType = *activity.CreditTypeUsed
		}

		activityEntries[i] = entry
	}

	response := models.ActivityResponse{
		Success:    true,
		Activities: activityEntries,
		Pagination: map[string]interface{}{
			"limit":  limit,
			"offset": offset,
		},
	}

	c.JSON(http.StatusOK, response)
}

// HandleListAPIKeys returns user's API keys
func (h *UserHandler) HandleListAPIKeys(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	apiKeys, err := h.db.GetUserAPIKeys(c.Request.Context(), userID.(string))
	if err != nil {
		logger.FromGinContext(c).LogError(err, "Failed to get user API keys", map[string]interface{}{
			"user_id": userID.(string),
		})
		c.Error(errors.NewAPIError("API_KEYS_ERROR", "Failed to get API keys", http.StatusInternalServerError))
		return
	}

	// Convert to response format (exclude sensitive data)
	responseKeys := make([]models.APIKey, len(apiKeys))
	for i, key := range apiKeys {
		var lastUsed *int64
		if key.LastUsedAt != nil {
			timestamp := key.LastUsedAt.Unix()
			lastUsed = &timestamp
		}

		responseKeys[i] = models.APIKey{
			ID:        key.ID,
			Name:      key.KeyName,
			Prefix:    key.KeyPrefix,
			LastUsed:  lastUsed,
			IsActive:  key.IsActive,
			CreatedAt: key.CreatedAt.Unix(),
		}
	}

	response := models.APIKeyListResponse{
		Success: true,
		Keys:    responseKeys,
	}

	c.JSON(http.StatusOK, response)
}

// HandleCreateAPIKey creates a new API key
func (h *UserHandler) HandleCreateAPIKey(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	var req models.CreateAPIKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.Error(errors.NewAPIError("INVALID_REQUEST", err.Error(), http.StatusBadRequest))
		return
	}

	// Validate API key name
	if err := validation.ValidateAPIKeyName(req.Name); err != nil {
		c.Error(err)
		return
	}

	// Generate new API key
	apiKey, err := auth.GenerateAPIKey(false) // false = live key
	if err != nil {
		logger.FromGinContext(c).LogError(err, "Failed to generate API key", map[string]interface{}{
			"user_id": userID.(string),
		})
		c.Error(errors.ErrInternalServer)
		return
	}

	// Hash the key for secure storage
	hashedKey := auth.HashAPIKey(apiKey)
	keyPrefix := auth.GetKeyPrefix(apiKey)

	// Create API key in database
	createdKey, err := h.db.CreateAPIKey(c.Request.Context(), userID.(string), req.Name, hashedKey, keyPrefix)
	if err != nil {
		logger.FromGinContext(c).LogError(err, "Failed to create API key in database", map[string]interface{}{
			"user_id":    userID.(string),
			"key_name":   req.Name,
			"key_prefix": keyPrefix,
		})
		c.Error(errors.NewAPIError("API_KEY_CREATION_ERROR", "Failed to create API key", http.StatusInternalServerError))
		return
	}

	// Log successful API key creation
	logger.FromGinContext(c).Info().
		Str("user_id", userID.(string)).
		Str("key_name", req.Name).
		Str("key_prefix", keyPrefix).
		Int64("key_id", createdKey.ID).
		Msg("API key created successfully")

	response := models.CreateAPIKeyResponse{
		Success: true,
		APIKey:  apiKey, // Return plaintext key (only time it's visible)
		KeyID:   createdKey.ID,
	}

	c.JSON(http.StatusOK, response)
}

// HandleDeleteAPIKey deletes an API key
func (h *UserHandler) HandleDeleteAPIKey(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.Error(errors.ErrUnauthorized)
		return
	}

	keyIDStr := c.Param("key_id")
	if keyIDStr == "" {
		c.Error(errors.NewAPIError("INVALID_REQUEST", "Key ID is required", http.StatusBadRequest))
		return
	}

	// Parse key ID
	keyID, err := strconv.ParseInt(keyIDStr, 10, 64)
	if err != nil {
		c.Error(errors.NewAPIError("INVALID_KEY_ID", "Invalid key ID format", http.StatusBadRequest))
		return
	}

	// Get the API key first to log details
	apiKey, err := h.db.GetAPIKey(c.Request.Context(), userID.(string), keyID)
	if err != nil {
		logger.FromGinContext(c).LogError(err, "Failed to get API key for deletion", map[string]interface{}{
			"user_id": userID.(string),
			"key_id":  keyID,
		})
		c.Error(errors.NewAPIError("API_KEY_NOT_FOUND", "API key not found", http.StatusNotFound))
		return
	}

	// Delete the API key (soft delete)
	err = h.db.DeleteAPIKey(c.Request.Context(), userID.(string), keyID)
	if err != nil {
		logger.FromGinContext(c).LogError(err, "Failed to delete API key", map[string]interface{}{
			"user_id":  userID.(string),
			"key_id":   keyID,
			"key_name": apiKey.KeyName,
		})
		c.Error(errors.NewAPIError("API_KEY_DELETE_ERROR", "Failed to delete API key", http.StatusInternalServerError))
		return
	}

	// Log successful deletion
	logger.FromGinContext(c).Info().
		Str("user_id", userID.(string)).
		Int64("key_id", keyID).
		Str("key_name", apiKey.KeyName).
		Str("key_prefix", apiKey.KeyPrefix).
		Msg("API key deleted successfully")

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "API key deleted successfully",
	})
}