package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/superuserkalo/OpenBGRemover/go-api/auth"
	"github.com/superuserkalo/OpenBGRemover/go-api/database"
)

// Configuration
type Config struct {
	BeamEndpoint string
	BeamAPIKey   string
	ServerPort   string
	Environment  string
	MaxFileSize  int64
	Timeout      time.Duration
}

// Request/Response types for Beam API
type BeamRequest struct {
	Image      string                 `json:"image"`
	Quality    string                 `json:"quality,omitempty"`
	Format     string                 `json:"format,omitempty"`
	ReturnMask bool                   `json:"return_mask,omitempty"`
	Resize     map[string]interface{} `json:"resize,omitempty"`
	Debug      bool                   `json:"debug,omitempty"`
}

type BeamResponse struct {
	Success  bool                   `json:"success"`
	Image    string                 `json:"image,omitempty"`
	Mask     string                 `json:"mask,omitempty"`
	TaskID   string                 `json:"task_id,omitempty"`
	Error    string                 `json:"error,omitempty"`
	Code     string                 `json:"code,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// SDK-friendly API request/response types
type APIRequest struct {
	ImageData     string                 `json:"image_data" binding:"required"`
	Quality       string                 `json:"quality"`
	Format        string                 `json:"format"`
	ReturnMask    bool                   `json:"return_mask"`
	ResizeOptions map[string]interface{} `json:"resize_options,omitempty"`
}

type APIResponse struct {
	Success        bool                   `json:"success"`
	ResultImage    string                 `json:"result_image,omitempty"`
	MaskImage      string                 `json:"mask_image,omitempty"`
	Error          string                 `json:"error,omitempty"`
	ErrorCode      string                 `json:"error_code,omitempty"`
	ProcessingTime int64                  `json:"processing_time_ms,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

// Gateway service
type Gateway struct {
	config      *Config
	client      *http.Client
	db          *database.DB
	authService *auth.AuthService
}

// Load environment variables from .env file
func loadEnv() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using system environment variables")
	} else {
		log.Println("✅ Loaded environment variables from .env file")
	}
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("Required environment variable %s is not set", key)
	}
	return value
}

// Load configuration with validation
func LoadConfig() (*Config, error) {
  port := os.Getenv("PORT")
  if port == "" {
    port = "8080"
  }

  config := &Config{
		BeamEndpoint: mustGetEnv("BEAM_ENDPOINT_URL"),
		BeamAPIKey:   mustGetEnv("BEAM_API_KEY"),
		ServerPort:   port,
		Environment:  "development",
		MaxFileSize:  32 << 20, // 32MB
		Timeout:      180 * time.Second,
	}

	// Validate configuration
	if !strings.HasPrefix(config.BeamEndpoint, "http") {
		return nil, fmt.Errorf("invalid BEAM_ENDPOINT_URL: must start with http or https")
	}

	if len(config.BeamAPIKey) < 10 {
		return nil, fmt.Errorf("invalid BEAM_API_KEY: too short")
	}

	if port, err := strconv.Atoi(config.ServerPort); err != nil || port < 1 || port > 65535 {
		return nil, fmt.Errorf("invalid PORT: must be a valid port number")
	}

	return config, nil
}

// Create new gateway
func NewGateway(config *Config, db *database.DB, authService *auth.AuthService) *Gateway {
	return &Gateway{
		config:      config,
		client:      &http.Client{
			Timeout: config.Timeout,
		},
		db:          db,
		authService: authService,
	}
}

// Call Beam worker with context and better error handling
func (g *Gateway) callBeamWorker(ctx context.Context, beamReq BeamRequest) (*BeamResponse, error) {
	reqBody, err := json.Marshal(beamReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", g.config.BeamEndpoint, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+g.config.BeamAPIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "background-removal-gateway/1.0.0")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call beam worker: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("beam worker returned status %d: %s", resp.StatusCode, string(body))
	}

	var beamResp BeamResponse
	if err := json.Unmarshal(body, &beamResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &beamResp, nil
}

// Validate image data format
func validateImageData(imageData string) error {
	if imageData == "" {
		return fmt.Errorf("image data is empty")
	}

	// Check if it's a valid data URL or base64
	if strings.HasPrefix(imageData, "data:") {
		parts := strings.Split(imageData, ",")
		if len(parts) != 2 {
			return fmt.Errorf("invalid data URL format")
		}
		// Validate MIME type
		if !strings.Contains(parts[0], "image/") {
			return fmt.Errorf("invalid image MIME type")
		}
		imageData = parts[1]
	}

	// Try to decode base64 to validate
	if _, err := base64.StdEncoding.DecodeString(imageData); err != nil {
		return fmt.Errorf("invalid base64 encoding: %w", err)
	}

	return nil
}

// Validate quality parameter
func validateQuality(quality string) bool {
	validQualities := []string{"auto", "quality", "portrait", "product", "speed"}
	for _, v := range validQualities {
		if quality == v {
			return true
		}
	}
	return false
}

// Validate format parameter
func validateFormat(format string) bool {
	validFormats := []string{"png", "jpg", "jpeg", "webp", "gif"}
	for _, v := range validFormats {
		if format == v {
			return true
		}
	}
	return false
}

// Authentication middleware for protected endpoints
func (g *Gateway) authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
			c.Abort()
			return
		}

		token, err := auth.ExtractTokenFromHeader(authHeader)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header"})
			c.Abort()
			return
		}

		var userID string
		var apiKeyID *int64

		if auth.IsAPIKey(token) {
			// API Key authentication
			hashedKey := auth.HashAPIKey(token)
			apiKey, err := g.db.GetAPIKeyByHash(c.Request.Context(), hashedKey)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid API key"})
				c.Abort()
				return
			}
			userID = apiKey.UserID
			apiKeyID = &apiKey.ID

			// Update last used timestamp
			go g.db.UpdateAPIKeyLastUsed(context.Background(), apiKey.ID)
		} else {
			// JWT authentication
			claims, err := g.authService.VerifyJWT(token)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid JWT token"})
				c.Abort()
				return
			}
			userID = claims.Subject
		}

		// Get user profile
		profile, err := g.db.GetProfile(c.Request.Context(), userID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User profile not found"})
			c.Abort()
			return
		}

		// Store user info in context
		c.Set("userID", userID)
		c.Set("profile", profile)
		c.Set("apiKeyID", apiKeyID)
		c.Next()
	}
}

// Main API endpoint for SDK calls
func (g *Gateway) handleRemoveBackground(c *gin.Context) {
	startTime := time.Now()

	// Get user info from middleware
	userID, _ := c.Get("userID")
	apiKeyID, _ := c.Get("apiKeyID")

	// Determine source
	source := "ui"
	if apiKeyID != nil {
		source = "api"
	}

	// Decrement credits before processing
	creditType, err := g.db.DecrementCredits(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusPaymentRequired, APIResponse{
			Success:   false,
			Error:     "Insufficient credits",
			ErrorCode: "INSUFFICIENT_CREDITS",
		})
		return
	}

	var apiReq APIRequest
	if err := c.ShouldBindJSON(&apiReq); err != nil {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success:   false,
			Error:     fmt.Sprintf("Invalid JSON request: %v", err),
			ErrorCode: "INVALID_REQUEST",
		})
		// Log failed usage
		g.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, "Invalid JSON request", 0, creditType)
		return
	}

	// Validate image data
	if err := validateImageData(apiReq.ImageData); err != nil {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success:   false,
			Error:     fmt.Sprintf("Invalid image data: %v", err),
			ErrorCode: "INVALID_IMAGE_DATA",
		})
		return
	}

	// Set and validate defaults
	if apiReq.Quality == "" {
		apiReq.Quality = "auto"
	} else if !validateQuality(apiReq.Quality) {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success:   false,
			Error:     "Invalid quality parameter",
			ErrorCode: "INVALID_QUALITY",
		})
		return
	}

	if apiReq.Format == "" {
		apiReq.Format = "png"
	} else if !validateFormat(apiReq.Format) {
		c.JSON(http.StatusBadRequest, APIResponse{
			Success:   false,
			Error:     "Invalid format parameter",
			ErrorCode: "INVALID_FORMAT",
		})
		return
	}

	// Build Beam request
	beamReq := BeamRequest{
		Image:      apiReq.ImageData,
		Quality:    apiReq.Quality,
		Format:     apiReq.Format,
		ReturnMask: apiReq.ReturnMask,
		Resize:     apiReq.ResizeOptions,
		Debug:      g.config.Environment == "development",
	}

	// Call Beam worker with context
	ctx, cancel := context.WithTimeout(c.Request.Context(), g.config.Timeout)
	defer cancel()

	beamResp, err := g.callBeamWorker(ctx, beamReq)
	if err != nil {
		log.Printf("Error calling Beam worker: %v", err)

		// Handle different types of errors
		if ctx.Err() == context.DeadlineExceeded {
			c.JSON(http.StatusRequestTimeout, APIResponse{
				Success:   false,
				Error:     "Request timeout",
				ErrorCode: "TIMEOUT",
			})
			g.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, "Request timeout", 0, creditType)
		} else {
			c.JSON(http.StatusInternalServerError, APIResponse{
				Success:   false,
				Error:     "Internal server error",
				ErrorCode: "BEAM_ERROR",
			})
			g.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, "Beam worker error", 0, creditType)
		}
		return
	}

	// Handle Beam response
	if !beamResp.Success {
		errorCode := beamResp.Code
		if errorCode == "" {
			errorCode = "PROCESSING_ERROR"
		}
		c.JSON(http.StatusBadRequest, APIResponse{
			Success:   false,
			Error:     beamResp.Error,
			ErrorCode: errorCode,
		})
		g.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, false, beamResp.Error, 0, creditType)
		return
	}

	// Build API response
	processingTime := time.Since(startTime).Milliseconds()

	apiResp := APIResponse{
		Success:        true,
		ResultImage:    beamResp.Image,
		MaskImage:      beamResp.Mask,
		ProcessingTime: processingTime,
		Metadata:       beamResp.Metadata,
	}

	// Add gateway metadata
	if apiResp.Metadata == nil {
		apiResp.Metadata = make(map[string]interface{})
	}
	apiResp.Metadata["gateway_processing_time_ms"] = processingTime
	if beamResp.Metadata != nil {
		if beamTime, ok := beamResp.Metadata["processing_time_ms"]; ok {
			apiResp.Metadata["beam_processing_time_ms"] = beamTime
		}
	}

	// Log successful usage
	g.logUsage(c.Request.Context(), userID.(string), apiKeyID, source, true, "", int(processingTime), creditType)

	c.JSON(http.StatusOK, apiResp)
}

// Legacy endpoint for multipart/form-data (backward compatibility)
func (g *Gateway) handleLegacyUpload(c *gin.Context) {
	// Get uploaded file with proper error handling
	file, header, err := c.Request.FormFile("image")
	if err != nil {
		if err == http.ErrMissingFile {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No image file provided"})
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to get file: %v", err)})
		}
		return
	}
	defer func() {
		if closeErr := file.Close(); closeErr != nil {
			log.Printf("Error closing file: %v", closeErr)
		}
	}()

	// Validate file size
	if header.Size > g.config.MaxFileSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("File too large (max %dMB)", g.config.MaxFileSize/(1<<20)),
		})
		return
	}

	// Validate content type
	if !isValidImageType(header.Header) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid file type. Only images are allowed"})
		return
	}

	// Read file and encode to base64
	imageBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read image"})
		return
	}

	// Get and validate form values
	quality := c.DefaultPostForm("quality", "auto")
	if !validateQuality(quality) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid quality parameter"})
		return
	}

	format := c.DefaultPostForm("format", "png")
	if !validateFormat(format) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid format parameter"})
		return
	}

	// Build Beam request
	beamReq := BeamRequest{
		Image:   encodeBase64(imageBytes),
		Quality: quality,
		Format:  format,
	}

	// Call Beam worker with context
	ctx, cancel := context.WithTimeout(c.Request.Context(), g.config.Timeout)
	defer cancel()

	beamResp, err := g.callBeamWorker(ctx, beamReq)
	if err != nil {
		log.Printf("Error calling Beam worker: %v", err)
		if ctx.Err() == context.DeadlineExceeded {
			c.JSON(http.StatusRequestTimeout, gin.H{"error": "Request timeout"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Processing failed"})
		}
		return
	}

	if !beamResp.Success {
		c.JSON(http.StatusBadRequest, gin.H{"error": beamResp.Error})
		return
	}

	// Return raw image for legacy compatibility
	imageData, err := decodeBase64(beamResp.Image)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode result"})
		return
	}

	// Set proper content type based on format
	contentType := "image/png" // default
	if format == "jpg" || format == "jpeg" {
		contentType = "image/jpeg"
	} else if format == "webp" {
		contentType = "image/webp"
	} else if format == "gif" {
		contentType = "image/gif"
	}

	c.Data(http.StatusOK, contentType, imageData)
}

// Health check endpoint with more detailed information
func (g *Gateway) handleHealth(c *gin.Context) {
	health := gin.H{
		"status":                   "healthy",
		"service":                  "background-removal-gateway",
		"version":                  "1.0.1",
		"environment":              g.config.Environment,
		"timestamp":                time.Now().Unix(),
		"beam_endpoint_configured": g.config.BeamEndpoint != "",
		"uptime_seconds":           time.Since(startTime).Seconds(),
		"max_file_size_mb":         g.config.MaxFileSize / (1 << 20),
		"timeout_seconds":          g.config.Timeout.Seconds(),
	}

	c.JSON(http.StatusOK, health)
}

// API info endpoint (for SDK discovery)
func (g *Gateway) handleAPIInfo(c *gin.Context) {
	info := gin.H{
		"service_name": "Background Removal API",
		"version":      "1.0.1",
		"endpoints": gin.H{
			"remove_background": "/api/v1/remove-background",
			"legacy_upload":     "/v1/remove-background",
			"health":            "/health",
			"api_info":          "/api/info",
		},
		"supported_formats": []string{"png", "jpg", "jpeg", "webp", "gif"},
		"quality_presets":   []string{"auto", "quality", "portrait", "product", "speed"},
		"max_file_size_mb":  g.config.MaxFileSize / (1 << 20),
		"timeout_seconds":   g.config.Timeout.Seconds(),
		"features": []string{
			"static_images",
			"animated_gifs",
			"custom_resizing",
			"mask_output",
			"multiple_formats",
			"input_validation",
			"timeout_handling",
		},
		"sdk_support": []string{
			"python", "go", "rust", "javascript", "csharp", "cpp",
		},
	}

	c.JSON(http.StatusOK, info)
}

// Helper functions
func encodeBase64(data []byte) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func decodeBase64(data string) ([]byte, error) {
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

// Validate image content type
func isValidImageType(header map[string][]string) bool {
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

// Custom logging middleware with request ID
func (g *Gateway) loggingMiddleware() gin.HandlerFunc {
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

// Request size limiting middleware
func (g *Gateway) requestSizeLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.ContentLength > g.config.MaxFileSize {
			c.JSON(http.StatusRequestEntityTooLarge, gin.H{
				"error": fmt.Sprintf("Request too large (max %dMB)", g.config.MaxFileSize/(1<<20)),
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// logUsage helper function to create usage log entries
func (g *Gateway) logUsage(ctx context.Context, userID string, apiKeyID interface{}, source string, success bool, errorMsg string, processingTimeMs int, creditType string) {
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

	if err := g.db.CreateUsageLog(ctx, logEntry); err != nil {
		log.Printf("Failed to create usage log: %v", err)
	}
}

// handleStats returns user statistics
func (g *Gateway) handleStats(c *gin.Context) {
	userID, _ := c.Get("userID")
	stats, err := g.db.GetUserStats(c.Request.Context(), userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stats"})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// handleActivity returns user activity with pagination
func (g *Gateway) handleActivity(c *gin.Context) {
	userID, _ := c.Get("userID")

	limit := 50
	offset := 0

	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 && parsed <= 100 {
			limit = parsed
		}
	}

	if o := c.Query("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	activities, err := g.db.GetUserActivity(c.Request.Context(), userID.(string), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get activity"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"activities": activities,
		"limit":      limit,
		"offset":     offset,
	})
}

// handleListAPIKeys returns user's API keys
func (g *Gateway) handleListAPIKeys(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "API key management coming soon"})
}

// handleCreateAPIKey creates a new API key
func (g *Gateway) handleCreateAPIKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "API key creation coming soon"})
}

// handleDeleteAPIKey deletes an API key
func (g *Gateway) handleDeleteAPIKey(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "API key deletion coming soon"})
}

var startTime time.Time

func main() {
	startTime = time.Now()

  // Load .env variables
  loadEnv()

	// Load and validate configuration
	config, err := LoadConfig()
	if err != nil {
		log.Fatalf("❌ Configuration error: %v", err)
	}

	// Initialize database connection
	db, err := database.New()
	if err != nil {
		log.Fatalf("❌ Database connection error: %v", err)
	}
	defer db.Close()

	// Initialize authentication service
	authService, err := auth.NewAuthService()
	if err != nil {
		log.Fatalf("❌ Auth service initialization error: %v", err)
	}

	gateway := NewGateway(config, db, authService)

	// Set Gin mode based on environment
	if config.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	r := gin.New()

	// Middleware
	r.Use(gateway.loggingMiddleware())
	r.Use(gin.Recovery())
	r.Use(gateway.requestSizeLimitMiddleware())

	// CORS configuration - more restrictive in production
	corsConfig := cors.DefaultConfig()
	if config.Environment == "production" {
		corsConfig.AllowOrigins = strings.Split(mustGetEnv("ALLOWED_ORIGINS"), ",")
	} else {
		corsConfig.AllowAllOrigins = true
	}
  corsConfig.AllowMethods = []string{"GET", "POST", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Content-Type", "Authorization"}
	corsConfig.ExposeHeaders = []string{"Content-Length"}
	corsConfig.MaxAge = 12 * time.Hour
	r.Use(cors.New(corsConfig))

	// API routes
	api := r.Group("/api/v1")
	{
		// Protected endpoints requiring authentication
		api.Use(gateway.authMiddleware())
		api.POST("/remove-background", gateway.handleRemoveBackground)
		api.GET("/stats", gateway.handleStats)
		api.GET("/activity", gateway.handleActivity)
		api.GET("/keys", gateway.handleListAPIKeys)
		api.POST("/keys", gateway.handleCreateAPIKey)
		api.DELETE("/keys/:key_id", gateway.handleDeleteAPIKey)
	}

	// Legacy routes
	r.POST("/v1/remove-background", gateway.handleLegacyUpload)

	// Utility routes
	r.GET("/health", gateway.handleHealth)
	r.GET("/api/info", gateway.handleAPIInfo)

	// Root handler
	r.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, "Background Removal API Gateway - Ready!\nDocs: /api/info\nHealth: /health")
	})

	// Handle 404
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Endpoint not found"})
	})

	// Create server with timeouts
	srv := &http.Server{
		Addr:         ":" + config.ServerPort,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: config.Timeout + 30*time.Second, // Beam timeout + buffer
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigterm := make(chan os.Signal, 1)
		signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)
		<-sigterm

		log.Println("🛑 Shutting down server...")

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("❌ Server forced to shutdown: %v", err)
		}
	}()

	log.Printf("🚀 Background Removal Gateway starting on port %s", config.ServerPort)
	log.Printf("📡 Beam endpoint: %s", config.BeamEndpoint)
	log.Printf("🌍 Environment: %s", config.Environment)
	log.Printf("📊 Max file size: %dMB", config.MaxFileSize/(1<<20))
	log.Printf("⏱️  Timeout: %v", config.Timeout)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("❌ Failed to start server: %v", err)
	}

	log.Println("✅ Server shutdown complete")
}

/*
Required dependencies:
go mod init background-removal-gateway
go get github.com/gin-gonic/gin
go get github.com/gin-contrib/cors

Environment variables needed:
BEAM_ENDPOINT_URL=https://your-deployment.app.beam.cloud
BEAM_API_KEY=your-beam-api-key
PORT=8080
ENVIRONMENT=development
ALLOWED_ORIGINS=https://yourdomain.com,https://anotherdomain.com (for production)

Example SDK request:
POST /api/v1/remove-background
{
  "image_data": "base64-encoded-image-data",
  "quality": "auto",
  "format": "png",
  "return_mask": false
}

Example response:
{
  "success": true,
  "result_image": "base64-encoded-result",
  "processing_time_ms": 1250,
  "metadata": {
    "original_size": [800, 600],
    "output_size": [800, 600],
    "beam_processing_time_ms": 1100,
    "gateway_processing_time_ms": 1250
  }
}
*/
