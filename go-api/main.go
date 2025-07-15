package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
  "github.com/joho/godotenv"

	"github.com/superuserkalo/OpenBGRemover/go-api/auth"
	"github.com/superuserkalo/OpenBGRemover/go-api/database"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/cache"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/handlers"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/middleware"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/services"
)

func main() {
    err := godotenv.Load()
    if err != nil {
        log.Println("No .env file found, using system environment variables")
    } else {
        log.Println("✅ Successfully loaded .env file")
    }

	startTime := time.Now()

	// Parse command line flags
	healthCheck := flag.Bool("health-check", false, "Perform health check and exit")
	flag.Parse()

	// Handle health check flag for Docker
	if *healthCheck {
		performHealthCheck()
		return
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("❌ Configuration error: %v", err)
	}

	// Initialize structured logging
	appLogger := logger.Setup(cfg)
	logger.SetGlobalLogger(appLogger)

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

	// Initialize cache
	appCache := cache.NewMemoryCache()
	defer appCache.Close()

	// Initialize services
	bgService := services.NewBackgroundRemovalService(cfg)

	// Initialize handlers
	bgHandler := handlers.NewBackgroundRemovalHandler(bgService, db)
	userHandler := handlers.NewUserHandler(db)
	healthHandler := handlers.NewHealthHandler(cfg, bgService, startTime)
	legacyHandler := handlers.NewLegacyHandler(cfg, bgService)

	// Set Gin mode based on environment
	if cfg.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	r := gin.New()

	// Global middleware
	r.Use(middleware.RequestID())
	r.Use(middleware.StructuredLogging())
	r.Use(gin.Recovery())
	r.Use(middleware.ErrorHandler())
	r.Use(middleware.Security())
	r.Use(middleware.RequestSizeLimit(cfg.Server.MaxFileSize))
	r.Use(middleware.CreateRateLimiter(cfg))
	r.Use(middleware.Compression(cfg))

	// CORS configuration
	corsConfig := cors.DefaultConfig()
	if cfg.IsProduction() && len(cfg.Server.AllowedOrigins) > 0 {
		corsConfig.AllowOrigins = cfg.Server.AllowedOrigins
	} else {
		corsConfig.AllowAllOrigins = true
	}
	corsConfig.AllowMethods = []string{"GET", "POST", "DELETE", "OPTIONS"}
	corsConfig.AllowHeaders = []string{"Content-Type", "Authorization"}
	corsConfig.ExposeHeaders = []string{"Content-Length"}
	corsConfig.MaxAge = 12 * time.Hour
	r.Use(cors.New(corsConfig))

	// API routes v1
	api := r.Group("/api/v1")
	{
		// Protected endpoints requiring authentication
		api.Use(middleware.AuthMiddleware(authService, db))
		api.POST("/remove-background", bgHandler.HandleRemoveBackground)
		api.GET("/stats", userHandler.HandleStats)
		api.GET("/activity", userHandler.HandleActivity)
		api.GET("/keys", userHandler.HandleListAPIKeys)
		api.POST("/keys", userHandler.HandleCreateAPIKey)
		api.DELETE("/keys/:key_id", userHandler.HandleDeleteAPIKey)
	}

	// Legacy routes (no authentication for backward compatibility)
	r.POST("/v1/remove-background", legacyHandler.HandleLegacyUpload)

	// Utility routes with caching
	r.GET("/health", middleware.CacheMiddleware(appCache, 1*time.Minute), healthHandler.HandleHealth)
	r.GET("/api/info", middleware.CacheMiddleware(appCache, 5*time.Minute), healthHandler.HandleAPIInfo)
	r.GET("/", healthHandler.HandleRoot)

	// Handle 404
	r.NoRoute(healthHandler.HandleNotFound)

	// Create server with timeouts
	srv := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Graceful shutdown
	go func() {
		sigterm := make(chan os.Signal, 1)
		signal.Notify(sigterm, syscall.SIGINT, syscall.SIGTERM)
		<-sigterm

		appLogger.Info().Msg("🛑 Shutting down server...")

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			appLogger.Error().Err(err).Msg("❌ Server forced to shutdown")
		}
	}()

	appLogger.Info().
		Str("port", cfg.Server.Port).
		Str("beam_endpoint", cfg.Beam.EndpointURL).
		Str("environment", cfg.Environment).
		Int64("max_file_size_mb", cfg.Server.MaxFileSize/(1<<20)).
		Dur("timeout", cfg.Beam.Timeout).
		Bool("api_keys_enabled", cfg.Features.EnableAPIKeys).
		Bool("rate_limit_enabled", cfg.Features.EnableRateLimit).
		Bool("compression_enabled", cfg.Features.EnableCompression).
		Msg("🚀 Background Removal Gateway v2.0.0 starting")

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		appLogger.Fatal().Err(err).Msg("❌ Failed to start server")
	}

	appLogger.Info().Msg("✅ Server shutdown complete")
}

// performHealthCheck performs a simple health check for Docker
func performHealthCheck() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	client := &http.Client{
		Timeout: 3 * time.Second,
	}

	resp, err := client.Get(fmt.Sprintf("http://localhost:%s/health", port))
	if err != nil {
		fmt.Printf("Health check failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Printf("Health check failed: status %d\n", resp.StatusCode)
		os.Exit(1)
	}

	fmt.Println("Health check passed")
	os.Exit(0)
}
