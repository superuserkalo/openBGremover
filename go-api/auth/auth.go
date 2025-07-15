package auth

import (
	"fmt"
	"os"
	"strings"
	"crypto/sha256"
	"crypto/rand"
	"encoding/hex"

	"github.com/golang-jwt/jwt/v5"
)

// SupabaseClaims represents the claims in a Supabase JWT
type SupabaseClaims struct {
	jwt.RegisteredClaims
	Role           string                 `json:"role"`
	Email          string                 `json:"email"`
	UserMetadata   map[string]interface{} `json:"user_metadata"`
	AppMetadata    map[string]interface{} `json:"app_metadata"`
}

// AuthService handles JWT verification using HMAC-SHA256
type AuthService struct {
	jwtSecret []byte
}

// NewAuthService creates a new auth service
func NewAuthService() (*AuthService, error) {
	jwtSecret := os.Getenv("SUPABASE_JWT_SECRET")
	if jwtSecret == "" {
		return nil, fmt.Errorf("SUPABASE_JWT_SECRET environment variable is required")
	}

	return &AuthService{
		jwtSecret: []byte(jwtSecret),
	}, nil
}

// VerifyJWT verifies a Supabase JWT token using HMAC-SHA256 and returns the claims
func (a *AuthService) VerifyJWT(tokenString string) (*SupabaseClaims, error) {
	// Parse the token with HMAC-SHA256
	token, err := jwt.ParseWithClaims(tokenString, &SupabaseClaims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify the signing method is HMAC
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return a.jwtSecret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	// Verify the token is valid
	if !token.Valid {
		return nil, fmt.Errorf("token is invalid")
	}

	// Extract claims
	claims, ok := token.Claims.(*SupabaseClaims)
	if !ok {
		return nil, fmt.Errorf("failed to extract claims")
	}

	return claims, nil
}

// ExtractTokenFromHeader extracts the JWT token from the Authorization header
func ExtractTokenFromHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", fmt.Errorf("authorization header is empty")
	}

	// Check if it's a Bearer token
	if strings.HasPrefix(authHeader, "Bearer ") {
		return strings.TrimPrefix(authHeader, "Bearer "), nil
	}

	// For API keys, return as-is for further processing
	return authHeader, nil
}

// IsAPIKey checks if the token looks like an API key (starts with "bg_")
func IsAPIKey(token string) bool {
	return strings.HasPrefix(token, "bg_")
}

// HashAPIKey creates a hash of an API key for database storage
func HashAPIKey(apiKey string) string {
	hasher := sha256.New()
	hasher.Write([]byte(apiKey))
	hash := hasher.Sum(nil)
	return fmt.Sprintf("%x", hash)
}

// GenerateAPIKey generates a new API key with the format bg_live_sk_... or bg_test_sk_...
func GenerateAPIKey(isTest bool) (string, error) {
	prefix := "bg_live_sk_"
	if isTest {
		prefix = "bg_test_sk_"
	}

	// Generate 32 random bytes
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// Encode to hex string
	randomPart := hex.EncodeToString(randomBytes)
	return prefix + randomPart, nil
}

// GetKeyPrefix extracts the prefix from an API key for identification
func GetKeyPrefix(apiKey string) string {
	// Return the first 16 characters for identification
	if len(apiKey) > 16 {
		return apiKey[:16]
	}
	return apiKey
}