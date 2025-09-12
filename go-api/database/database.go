package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DB holds the database connection pool and provides database operations
type DB struct {
    pool *pgxpool.Pool
}

// Profile represents a user profile from the profiles table
type Profile struct {
	ID                     string     `json:"id"`
	CurrentBillingModel    string     `json:"current_billing_model"`
	FreeImagesRemaining    int        `json:"free_images_remaining"`
	FreeImagesResetAt      time.Time  `json:"free_images_reset_at"`
	BulkImagesRemaining    int        `json:"bulk_images_remaining"`
	PaygUsageThisPeriod    int        `json:"payg_usage_this_period"`
	StripeCustomerID       *string    `json:"stripe_customer_id"`
	StripeSubscriptionID   *string    `json:"stripe_subscription_id"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
}

// APIKey represents an API key from the api_keys table
type APIKey struct {
	ID         int64      `json:"id"`
	UserID     string     `json:"user_id"`
	KeyName    string     `json:"key_name"`
	HashedKey  string     `json:"hashed_key"`
	KeyPrefix  string     `json:"key_prefix"`
	LastUsedAt *time.Time `json:"last_used_at"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

// UsageLog represents a usage log entry from the usage_logs table
type UsageLog struct {
	ID                int64      `json:"id"`
	UserID            string     `json:"user_id"`
	APIKeyID          *int64     `json:"api_key_id"`
	Source            string     `json:"source"`
	WasSuccessful     bool       `json:"was_successful"`
	ErrorMessage      *string    `json:"error_message"`
	ProcessingTimeMs  *int       `json:"processing_time_ms"`
	CreditTypeUsed    *string    `json:"credit_type_used"`
	CreatedAt         time.Time  `json:"created_at"`
}

// New creates a new database connection pool
func New() (*DB, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database URL: %w", err)
	}

	// Configure connection pool
	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = time.Minute * 30

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	log.Println("✅ Successfully connected to Supabase database")

	return &DB{pool: pool}, nil
}

// Close closes the database connection pool
func (db *DB) Close() {
	if db.pool != nil {
		db.pool.Close()
		log.Println("📊 Database connection pool closed")
	}
}

// GetProfile retrieves a user profile by user ID
func (db *DB) GetProfile(ctx context.Context, userID string) (*Profile, error) {
	query := `
		SELECT id, current_billing_model, free_images_remaining, free_images_reset_at,
		       bulk_images_remaining, payg_usage_this_period, stripe_customer_id,
		       stripe_subscription_id, created_at, updated_at
		FROM profiles
		WHERE id = $1`

	var profile Profile
	var stripeCustomerID, stripeSubscriptionID sql.NullString

	err := db.pool.QueryRow(ctx, query, userID).Scan(
		&profile.ID,
		&profile.CurrentBillingModel,
		&profile.FreeImagesRemaining,
		&profile.FreeImagesResetAt,
		&profile.BulkImagesRemaining,
		&profile.PaygUsageThisPeriod,
		&stripeCustomerID,
		&stripeSubscriptionID,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("profile not found for user %s", userID)
		}
		return nil, fmt.Errorf("failed to get profile: %w", err)
	}

	// Handle nullable fields
	if stripeCustomerID.Valid {
		profile.StripeCustomerID = &stripeCustomerID.String
	}
	if stripeSubscriptionID.Valid {
		profile.StripeSubscriptionID = &stripeSubscriptionID.String
	}

	return &profile, nil
}

// UpdateProfile updates a user profile
func (db *DB) UpdateProfile(ctx context.Context, userID string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}

	query := "UPDATE profiles SET updated_at = NOW()"
	args := []interface{}{userID}
	argIndex := 2

	for field, value := range updates {
		query += fmt.Sprintf(", %s = $%d", field, argIndex)
		args = append(args, value)
		argIndex++
	}

	query += " WHERE id = $1"

	_, err := db.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to update profile: %w", err)
	}

	return nil
}

// DecrementCredits decreases the appropriate credit balance for a user
// Returns the credit type used: "free", "bulk", "payg", or error if no credits available
func (db *DB) DecrementCredits(ctx context.Context, userID string) (string, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Lock the profile row for update
	var profile Profile
	query := `
		SELECT current_billing_model, free_images_remaining, bulk_images_remaining, payg_usage_this_period
		FROM profiles
		WHERE id = $1
		FOR UPDATE`

	err = tx.QueryRow(ctx, query, userID).Scan(
		&profile.CurrentBillingModel,
		&profile.FreeImagesRemaining,
		&profile.BulkImagesRemaining,
		&profile.PaygUsageThisPeriod,
	)

	if err != nil {
		return "", fmt.Errorf("failed to get profile for credit check: %w", err)
	}

	// Determine which credit type to use and decrement
	var creditType string
	var updateQuery string

	if profile.FreeImagesRemaining > 0 {
		creditType = "free"
		updateQuery = "UPDATE profiles SET free_images_remaining = free_images_remaining - 1, updated_at = NOW() WHERE id = $1"
	} else if profile.BulkImagesRemaining > 0 {
		creditType = "bulk"
		updateQuery = "UPDATE profiles SET bulk_images_remaining = bulk_images_remaining - 1, updated_at = NOW() WHERE id = $1"
	} else if profile.CurrentBillingModel == "pay_as_you_go" {
		creditType = "payg"
		updateQuery = "UPDATE profiles SET payg_usage_this_period = payg_usage_this_period + 1, updated_at = NOW() WHERE id = $1"
	} else {
		return "", fmt.Errorf("no credits available")
	}

	_, err = tx.Exec(ctx, updateQuery, userID)
	if err != nil {
		return "", fmt.Errorf("failed to decrement credits: %w", err)
	}

	if err = tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("failed to commit credit decrement: %w", err)
	}

	return creditType, nil
}

// GetAPIKeyByHash retrieves an API key by its hashed value
func (db *DB) GetAPIKeyByHash(ctx context.Context, hashedKey string) (*APIKey, error) {
	query := `
		SELECT id, user_id, key_name, hashed_key, key_prefix, last_used_at,
		       is_active, created_at, updated_at
		FROM api_keys
		WHERE hashed_key = $1 AND is_active = true`

	var apiKey APIKey
	var lastUsedAt sql.NullTime

	err := db.pool.QueryRow(ctx, query, hashedKey).Scan(
		&apiKey.ID,
		&apiKey.UserID,
		&apiKey.KeyName,
		&apiKey.HashedKey,
		&apiKey.KeyPrefix,
		&lastUsedAt,
		&apiKey.IsActive,
		&apiKey.CreatedAt,
		&apiKey.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("API key not found or inactive")
		}
		return nil, fmt.Errorf("failed to get API key: %w", err)
	}

	if lastUsedAt.Valid {
		apiKey.LastUsedAt = &lastUsedAt.Time
	}

	return &apiKey, nil
}

// UpdateAPIKeyLastUsed updates the last_used_at timestamp for an API key
func (db *DB) UpdateAPIKeyLastUsed(ctx context.Context, keyID int64) error {
	query := "UPDATE api_keys SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1"
	_, err := db.pool.Exec(ctx, query, keyID)
	if err != nil {
		return fmt.Errorf("failed to update API key last used: %w", err)
	}
	return nil
}

// CreateUsageLog creates a new usage log entry
func (db *DB) CreateUsageLog(ctx context.Context, log *UsageLog) error {
	query := `
		INSERT INTO usage_logs (user_id, api_key_id, source, was_successful, error_message, processing_time_ms, credit_type_used)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`

	_, err := db.pool.Exec(ctx, query,
		log.UserID,
		log.APIKeyID,
		log.Source,
		log.WasSuccessful,
		log.ErrorMessage,
		log.ProcessingTimeMs,
		log.CreditTypeUsed,
	)

	if err != nil {
		return fmt.Errorf("failed to create usage log: %w", err)
	}

	return nil
}

// GetUserStats retrieves usage statistics for a user
func (db *DB) GetUserStats(ctx context.Context, userID string) (map[string]interface{}, error) {
    profile, err := db.GetProfile(ctx, userID)
    if err != nil {
        return nil, err
    }

    // Get usage counts
    var totalRequests, totalProcessed, thisMonth int
    statsQuery := `
        SELECT
            COUNT(*) AS total_requests,
            COUNT(*) FILTER (WHERE was_successful = true) AS total_processed,
            COUNT(*) FILTER (
                WHERE was_successful = true
                  AND created_at >= date_trunc('month', NOW())
            ) AS this_month
        FROM usage_logs
        WHERE user_id = $1 AND source IN ('ui','api')`

    err = db.pool.QueryRow(ctx, statsQuery, userID).Scan(&totalRequests, &totalProcessed, &thisMonth)
    if err != nil {
        return nil, fmt.Errorf("failed to get usage stats: %w", err)
    }

    return map[string]interface{}{
        "profile":          profile,
        "api_calls_total":  totalRequests,
        "images_processed": totalProcessed,
        "images_this_month": thisMonth,
    }, nil
}

// GetUserActivity retrieves recent activity for a user with pagination
func (db *DB) GetUserActivity(ctx context.Context, userID string, limit, offset int) ([]UsageLog, error) {
	query := `
		SELECT id, user_id, api_key_id, source, was_successful, error_message,
		       processing_time_ms, credit_type_used, created_at
		FROM usage_logs
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3`

	rows, err := db.pool.Query(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get user activity: %w", err)
	}
	defer rows.Close()

	var logs []UsageLog
	for rows.Next() {
		var log UsageLog
		var apiKeyID sql.NullInt64
		var errorMessage sql.NullString
		var processingTimeMs sql.NullInt32
		var creditTypeUsed sql.NullString

		err := rows.Scan(
			&log.ID,
			&log.UserID,
			&apiKeyID,
			&log.Source,
			&log.WasSuccessful,
			&errorMessage,
			&processingTimeMs,
			&creditTypeUsed,
			&log.CreatedAt,
		)

		if err != nil {
			return nil, fmt.Errorf("failed to scan usage log: %w", err)
		}

		// Handle nullable fields
		if apiKeyID.Valid {
			log.APIKeyID = &apiKeyID.Int64
		}
		if errorMessage.Valid {
			log.ErrorMessage = &errorMessage.String
		}
		if processingTimeMs.Valid {
			processingTime := int(processingTimeMs.Int32)
			log.ProcessingTimeMs = &processingTime
		}
		if creditTypeUsed.Valid {
			log.CreditTypeUsed = &creditTypeUsed.String
		}

		logs = append(logs, log)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating usage logs: %w", err)
	}

	return logs, nil
}

// CreateAPIKey creates a new API key for a user
func (db *DB) CreateAPIKey(ctx context.Context, userID, keyName, hashedKey, keyPrefix string) (*APIKey, error) {
	query := `
		INSERT INTO api_keys (user_id, key_name, hashed_key, key_prefix, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, true, NOW(), NOW())
		RETURNING id, user_id, key_name, hashed_key, key_prefix, last_used_at, is_active, created_at, updated_at`

	var apiKey APIKey
	var lastUsedAt sql.NullTime

	err := db.pool.QueryRow(ctx, query, userID, keyName, hashedKey, keyPrefix).Scan(
		&apiKey.ID,
		&apiKey.UserID,
		&apiKey.KeyName,
		&apiKey.HashedKey,
		&apiKey.KeyPrefix,
		&lastUsedAt,
		&apiKey.IsActive,
		&apiKey.CreatedAt,
		&apiKey.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create API key: %w", err)
	}

	if lastUsedAt.Valid {
		apiKey.LastUsedAt = &lastUsedAt.Time
	}

	return &apiKey, nil
}

// GetUserAPIKeys retrieves all API keys for a user
func (db *DB) GetUserAPIKeys(ctx context.Context, userID string) ([]APIKey, error) {
	query := `
		SELECT id, user_id, key_name, hashed_key, key_prefix, last_used_at,
		       is_active, created_at, updated_at
		FROM api_keys
		WHERE user_id = $1
		ORDER BY created_at DESC`

	rows, err := db.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user API keys: %w", err)
	}
	defer rows.Close()

	var apiKeys []APIKey
	for rows.Next() {
		var apiKey APIKey
		var lastUsedAt sql.NullTime

		err := rows.Scan(
			&apiKey.ID,
			&apiKey.UserID,
			&apiKey.KeyName,
			&apiKey.HashedKey,
			&apiKey.KeyPrefix,
			&lastUsedAt,
			&apiKey.IsActive,
			&apiKey.CreatedAt,
			&apiKey.UpdatedAt,
		)

		if err != nil {
			return nil, fmt.Errorf("failed to scan API key: %w", err)
		}

		if lastUsedAt.Valid {
			apiKey.LastUsedAt = &lastUsedAt.Time
		}

		apiKeys = append(apiKeys, apiKey)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating API keys: %w", err)
	}

	return apiKeys, nil
}

// DeleteAPIKey soft-deletes an API key
func (db *DB) DeleteAPIKey(ctx context.Context, userID string, keyID int64) error {
	query := `
		UPDATE api_keys
		SET is_active = false, updated_at = NOW()
		WHERE id = $1 AND user_id = $2`

	result, err := db.pool.Exec(ctx, query, keyID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete API key: %w", err)
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("API key not found or not owned by user")
	}

	return nil
}

// GetAPIKey retrieves a specific API key for a user
func (db *DB) GetAPIKey(ctx context.Context, userID string, keyID int64) (*APIKey, error) {
	query := `
		SELECT id, user_id, key_name, hashed_key, key_prefix, last_used_at,
		       is_active, created_at, updated_at
		FROM api_keys
		WHERE id = $1 AND user_id = $2`

	var apiKey APIKey
	var lastUsedAt sql.NullTime

	err := db.pool.QueryRow(ctx, query, keyID, userID).Scan(
		&apiKey.ID,
		&apiKey.UserID,
		&apiKey.KeyName,
		&apiKey.HashedKey,
		&apiKey.KeyPrefix,
		&lastUsedAt,
		&apiKey.IsActive,
		&apiKey.CreatedAt,
		&apiKey.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("API key not found")
		}
		return nil, fmt.Errorf("failed to get API key: %w", err)
	}

	if lastUsedAt.Valid {
		apiKey.LastUsedAt = &lastUsedAt.Time
	}

	return &apiKey, nil
}

// DeleteUserData removes all application data for a user
func (db *DB) DeleteUserData(ctx context.Context, userID string) error {
    tx, err := db.pool.Begin(ctx)
    if err != nil {
        return fmt.Errorf("failed to begin txn: %w", err)
    }
    defer tx.Rollback(ctx)

    // Order: usage logs -> api keys -> profile
    if _, err := tx.Exec(ctx, "DELETE FROM usage_logs WHERE user_id = $1", userID); err != nil {
        return fmt.Errorf("failed to delete usage logs: %w", err)
    }
    if _, err := tx.Exec(ctx, "DELETE FROM api_keys WHERE user_id = $1", userID); err != nil {
        return fmt.Errorf("failed to delete api keys: %w", err)
    }
    if _, err := tx.Exec(ctx, "DELETE FROM profiles WHERE id = $1", userID); err != nil {
        return fmt.Errorf("failed to delete profile: %w", err)
    }

    if err := tx.Commit(ctx); err != nil {
        return fmt.Errorf("failed to commit user data deletion: %w", err)
    }
    return nil
}
