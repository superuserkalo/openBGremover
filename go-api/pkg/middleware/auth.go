package middleware

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/superuserkalo/OpenBGRemover/go-api/auth"
	"github.com/superuserkalo/OpenBGRemover/go-api/database"
	"github.com/superuserkalo/OpenBGRemover/go-api/errors"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
)

// AuthMiddleware handles authentication for protected endpoints
func AuthMiddleware(authService *auth.AuthService, db *database.DB) gin.HandlerFunc {
    return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Error(errors.ErrUnauthorized)
			c.Abort()
			return
		}

		token, err := auth.ExtractTokenFromHeader(authHeader)
		if err != nil {
			c.Error(errors.NewAPIError("INVALID_AUTH_HEADER", "Invalid authorization header", http.StatusUnauthorized))
			c.Abort()
			return
		}

		var userID string
		var apiKeyID *int64

		if auth.IsAPIKey(token) {
			// API Key authentication
			userID, apiKeyID, err = authenticateAPIKey(c.Request.Context(), db, token)
			if err != nil {
				logger.FromGinContext(c).LogAuth("", "api_key", false, err.Error())
				c.Error(err)
				c.Abort()
				return
			}
			logger.FromGinContext(c).LogAuth(userID, "api_key", true, "")
		} else {
			// JWT authentication
			userID, err = authenticateJWT(authService, token)
			if err != nil {
				logger.FromGinContext(c).LogAuth("", "jwt", false, err.Error())
				c.Error(err)
				c.Abort()
				return
			}
			logger.FromGinContext(c).LogAuth(userID, "jwt", true, "")
		}

        // Get user profile (optional for account deletion)
        profile, err := db.GetProfile(c.Request.Context(), userID)
        if err != nil {
            // Allow delete-account endpoint to proceed without a profile row
            if c.Request.Method == http.MethodDelete && c.Request.URL.Path == "/api/v1/account" {
                c.Set("userID", userID)
                c.Next()
                return
            }
            c.Error(errors.NewAPIError("USER_NOT_FOUND", "User profile not found", http.StatusUnauthorized))
            c.Abort()
            return
        }

        // Store user info in context
        c.Set("userID", userID)
        c.Set("profile", profile)
        if apiKeyID != nil {
            c.Set("apiKeyID", apiKeyID)
        }

        c.Next()
	}
}

// authenticateAPIKey handles API key authentication
func authenticateAPIKey(ctx context.Context, db *database.DB, token string) (string, *int64, error) {
	hashedKey := auth.HashAPIKey(token)
	apiKey, err := db.GetAPIKeyByHash(ctx, hashedKey)
	if err != nil {
		return "", nil, errors.ErrInvalidAPIKey
	}

	// Update last used timestamp asynchronously
	go func() {
		if err := db.UpdateAPIKeyLastUsed(context.Background(), apiKey.ID); err != nil {
			// Log error but don't fail the request
		}
	}()

	return apiKey.UserID, &apiKey.ID, nil
}

// authenticateJWT handles JWT authentication
func authenticateJWT(authService *auth.AuthService, token string) (string, error) {
	claims, err := authService.VerifyJWT(token)
	if err != nil {
		return "", errors.NewAPIError("INVALID_JWT", "Invalid JWT token", http.StatusUnauthorized)
	}

	return claims.Subject, nil
}
