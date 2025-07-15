package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all configuration for the application
type Config struct {
	// Server configuration
	Server ServerConfig `json:"server"`
	
	// External services
	Beam     BeamConfig     `json:"beam"`
	Supabase SupabaseConfig `json:"supabase"`
	Database DatabaseConfig `json:"database"`
	
	// Feature flags
	Features FeatureFlags `json:"features"`
	
	// Environment
	Environment string `json:"environment"`
}

// ServerConfig holds server-specific configuration
type ServerConfig struct {
	Port            string        `json:"port"`
	ReadTimeout     time.Duration `json:"read_timeout"`
	WriteTimeout    time.Duration `json:"write_timeout"`
	IdleTimeout     time.Duration `json:"idle_timeout"`
	MaxFileSize     int64         `json:"max_file_size"`
	AllowedOrigins  []string      `json:"allowed_origins"`
	EnableCORS      bool          `json:"enable_cors"`
	TrustedProxies  []string      `json:"trusted_proxies"`
}

// BeamConfig holds Beam API configuration
type BeamConfig struct {
	EndpointURL string        `json:"endpoint_url"`
	APIKey      string        `json:"-"` // Don't serialize API key
	Timeout     time.Duration `json:"timeout"`
}

// SupabaseConfig holds Supabase configuration
type SupabaseConfig struct {
	URL        string `json:"url"`
	AnonKey    string `json:"-"` // Don't serialize keys
	ServiceKey string `json:"-"`
}

// DatabaseConfig holds database configuration
type DatabaseConfig struct {
	URL             string        `json:"-"` // Don't serialize connection string
	MaxConnections  int           `json:"max_connections"`
	MinConnections  int           `json:"min_connections"`
	MaxLifetime     time.Duration `json:"max_lifetime"`
	MaxIdleTime     time.Duration `json:"max_idle_time"`
	ConnectTimeout  time.Duration `json:"connect_timeout"`
}

// FeatureFlags holds feature flag configuration
type FeatureFlags struct {
	EnableAPIKeys       bool `json:"enable_api_keys"`
	EnableRateLimit     bool `json:"enable_rate_limit"`
	EnableCompression   bool `json:"enable_compression"`
	EnableMetrics       bool `json:"enable_metrics"`
	EnableTracing       bool `json:"enable_tracing"`
	EnableDebugLogging  bool `json:"enable_debug_logging"`
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	// Try to load .env file (optional)
	if err := godotenv.Load(); err != nil {
		// .env file is optional, so don't fail if it doesn't exist
	}

	config := &Config{
		Environment: getEnvWithDefault("ENVIRONMENT", "development"),
	}

	// Load server configuration
	if err := loadServerConfig(&config.Server); err != nil {
		return nil, fmt.Errorf("failed to load server config: %w", err)
	}

	// Load Beam configuration
	if err := loadBeamConfig(&config.Beam); err != nil {
		return nil, fmt.Errorf("failed to load Beam config: %w", err)
	}

	// Load Supabase configuration
	if err := loadSupabaseConfig(&config.Supabase); err != nil {
		return nil, fmt.Errorf("failed to load Supabase config: %w", err)
	}

	// Load database configuration
	if err := loadDatabaseConfig(&config.Database); err != nil {
		return nil, fmt.Errorf("failed to load database config: %w", err)
	}

	// Load feature flags
	loadFeatureFlags(&config.Features)

	// Validate configuration
	if err := config.Validate(); err != nil {
		return nil, fmt.Errorf("configuration validation failed: %w", err)
	}

	return config, nil
}

// loadServerConfig loads server configuration
func loadServerConfig(config *ServerConfig) error {
	config.Port = getEnvWithDefault("PORT", "8080")
	
	// Validate port
	if port, err := strconv.Atoi(config.Port); err != nil || port < 1 || port > 65535 {
		return fmt.Errorf("invalid PORT: must be between 1 and 65535")
	}

	config.ReadTimeout = getDurationWithDefault("SERVER_READ_TIMEOUT", 30*time.Second)
	config.WriteTimeout = getDurationWithDefault("SERVER_WRITE_TIMEOUT", 30*time.Second)
	config.IdleTimeout = getDurationWithDefault("SERVER_IDLE_TIMEOUT", 120*time.Second)
	config.MaxFileSize = getInt64WithDefault("MAX_FILE_SIZE", 32<<20) // 32MB default

	// CORS configuration
	config.EnableCORS = getBoolWithDefault("ENABLE_CORS", true)
	if allowedOrigins := os.Getenv("ALLOWED_ORIGINS"); allowedOrigins != "" {
		config.AllowedOrigins = strings.Split(allowedOrigins, ",")
	}

	// Trusted proxies
	if trustedProxies := os.Getenv("TRUSTED_PROXIES"); trustedProxies != "" {
		config.TrustedProxies = strings.Split(trustedProxies, ",")
	}

	return nil
}

// loadBeamConfig loads Beam configuration
func loadBeamConfig(config *BeamConfig) error {
	config.EndpointURL = os.Getenv("BEAM_ENDPOINT_URL")
	if config.EndpointURL == "" {
		return fmt.Errorf("BEAM_ENDPOINT_URL is required")
	}

	if !strings.HasPrefix(config.EndpointURL, "http") {
		return fmt.Errorf("BEAM_ENDPOINT_URL must start with http or https")
	}

	config.APIKey = os.Getenv("BEAM_API_KEY")
	if config.APIKey == "" {
		return fmt.Errorf("BEAM_API_KEY is required")
	}

	if len(config.APIKey) < 10 {
		return fmt.Errorf("BEAM_API_KEY appears to be too short")
	}

	config.Timeout = getDurationWithDefault("BEAM_TIMEOUT", 180*time.Second)

	return nil
}

// loadSupabaseConfig loads Supabase configuration
func loadSupabaseConfig(config *SupabaseConfig) error {
	config.URL = os.Getenv("SUPABASE_URL")
	if config.URL == "" {
		return fmt.Errorf("SUPABASE_URL is required")
	}

	config.AnonKey = os.Getenv("SUPABASE_KEY")
	config.ServiceKey = os.Getenv("SUPABASE_SERVICE_KEY")

	return nil
}

// loadDatabaseConfig loads database configuration
func loadDatabaseConfig(config *DatabaseConfig) error {
	config.URL = os.Getenv("DATABASE_URL")
	if config.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}

	config.MaxConnections = getIntWithDefault("DB_MAX_CONNECTIONS", 10)
	config.MinConnections = getIntWithDefault("DB_MIN_CONNECTIONS", 2)
	config.MaxLifetime = getDurationWithDefault("DB_MAX_LIFETIME", time.Hour)
	config.MaxIdleTime = getDurationWithDefault("DB_MAX_IDLE_TIME", 30*time.Minute)
	config.ConnectTimeout = getDurationWithDefault("DB_CONNECT_TIMEOUT", 5*time.Second)

	return nil
}

// loadFeatureFlags loads feature flags
func loadFeatureFlags(config *FeatureFlags) {
	config.EnableAPIKeys = getBoolWithDefault("ENABLE_API_KEYS", true)
	config.EnableRateLimit = getBoolWithDefault("ENABLE_RATE_LIMIT", true)
	config.EnableCompression = getBoolWithDefault("ENABLE_COMPRESSION", true)
	config.EnableMetrics = getBoolWithDefault("ENABLE_METRICS", false)
	config.EnableTracing = getBoolWithDefault("ENABLE_TRACING", false)
	config.EnableDebugLogging = getBoolWithDefault("ENABLE_DEBUG_LOGGING", false)
}

// Validate validates the configuration
func (c *Config) Validate() error {
	// Additional validation logic can be added here
	return nil
}

// IsDevelopment returns true if running in development mode
func (c *Config) IsDevelopment() bool {
	return c.Environment == "development"
}

// IsProduction returns true if running in production mode
func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

// Helper functions
func getEnvWithDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntWithDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getInt64WithDefault(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.ParseInt(value, 10, 64); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getBoolWithDefault(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.ParseBool(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}

func getDurationWithDefault(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if parsed, err := time.ParseDuration(value); err == nil {
			return parsed
		}
	}
	return defaultValue
}