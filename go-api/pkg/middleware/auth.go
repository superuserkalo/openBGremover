package middleware

import (
    "context"
    "net/http"
    "strings"

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
        var isServiceKey bool
        var scopes []string

        if auth.IsAPIKey(token) {
            // API Key authentication
            userID, apiKeyID, isServiceKey, scopes, err = authenticateAPIKey(c.Request.Context(), db, token)
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

        // Service key: skip user profile/plan logic and restrict route
        if isServiceKey {
            // Only allow the specific trial route and require usage context header
            if c.FullPath() != "/api/v1/remove-background" {
                c.Error(errors.NewAPIError("FORBIDDEN", "Route not allowed for service key", http.StatusForbidden))
                c.Abort()
                return
            }
            // must have trial scope
            hasTrial := false
            for _, s := range scopes {
                if s == "trial" { hasTrial = true; break }
            }
            if !hasTrial {
                c.Error(errors.NewAPIError("FORBIDDEN", "Service key missing trial scope", http.StatusForbidden))
                c.Abort()
                return
            }
            if strings.ToLower(c.GetHeader("X-Usage-Context")) != "trial" {
                c.Error(errors.NewAPIError("FORBIDDEN", "Usage context required for service key", http.StatusForbidden))
                c.Abort()
                return
            }
            // Attach minimal context
            if apiKeyID != nil {
                c.Set("apiKeyID", apiKeyID)
            }
            c.Set("isServiceKey", true)
            c.Next()
            return
        }

        // Non-service (user) key or JWT: require user profile
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
func authenticateAPIKey(ctx context.Context, db *database.DB, token string) (string, *int64, bool, []string, error) {
    hashedKey := auth.HashAPIKey(token)
    apiKey, err := db.GetAPIKeyByHash(ctx, hashedKey)
    if err != nil {
        return "", nil, false, nil, errors.ErrInvalidAPIKey
    }

    // Update last used timestamp asynchronously
    go func() {
        _ = db.UpdateAPIKeyLastUsed(context.Background(), apiKey.ID)
    }()

    // Determine service key and extract user id if present
    uid := ""
    if apiKey.UserID != "" {
        uid = apiKey.UserID
    }
    return uid, &apiKey.ID, apiKey.IsService, apiKey.Scopes, nil
}

// authenticateJWT handles JWT authentication
func authenticateJWT(authService *auth.AuthService, token string) (string, error) {
	claims, err := authService.VerifyJWT(token)
	if err != nil {
		return "", errors.NewAPIError("INVALID_JWT", "Invalid JWT token", http.StatusUnauthorized)
	}

	return claims.Subject, nil
}
