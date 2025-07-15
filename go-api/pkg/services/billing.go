package services

import (
	"context"
	"fmt"
	"time"

	"github.com/superuserkalo/OpenBGRemover/go-api/database"
	"github.com/superuserkalo/OpenBGRemover/go-api/pkg/logger"
)

// BillingService handles billing operations for the SaaS platform
type BillingService struct {
	db *database.DB
}

// NewBillingService creates a new billing service
func NewBillingService(db *database.DB) *BillingService {
	return &BillingService{
		db: db,
	}
}

// BillingInfo represents current billing information for a user
type BillingInfo struct {
	BillingModel        string `json:"billing_model"`
	FreeCreditsUsed     int    `json:"free_credits_used"`
	FreeCreditsTotal    int    `json:"free_credits_total"`
	FreeCreditsResetAt  int64  `json:"free_credits_reset_at"`
	BulkCredits         int    `json:"bulk_credits"`
	PaygUsageThisPeriod int    `json:"payg_usage_this_period"`
	StripeCustomerID    string `json:"stripe_customer_id,omitempty"`
}

// GetBillingInfo retrieves comprehensive billing information for a user
func (s *BillingService) GetBillingInfo(ctx context.Context, userID string) (*BillingInfo, error) {
	profile, err := s.db.GetProfile(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user profile: %w", err)
	}

	billingInfo := &BillingInfo{
		BillingModel:        profile.CurrentBillingModel,
		FreeCreditsUsed:     50 - profile.FreeImagesRemaining,
		FreeCreditsTotal:    50,
		FreeCreditsResetAt:  profile.FreeImagesResetAt.Unix(),
		BulkCredits:         profile.BulkImagesRemaining,
		PaygUsageThisPeriod: profile.PaygUsageThisPeriod,
	}

	if profile.StripeCustomerID != nil {
		billingInfo.StripeCustomerID = *profile.StripeCustomerID
	}

	return billingInfo, nil
}

// CanProcessImage checks if a user can process an image based on their billing model
func (s *BillingService) CanProcessImage(ctx context.Context, userID string) (bool, string, error) {
	profile, err := s.db.GetProfile(ctx, userID)
	if err != nil {
		return false, "", fmt.Errorf("failed to get user profile: %w", err)
	}

	// Check if free credits have reset
	if time.Now().After(profile.FreeImagesResetAt) {
		err := s.ResetFreeCredits(ctx, userID)
		if err != nil {
			logger.GetGlobalLogger().LogError(err, "Failed to reset free credits", map[string]interface{}{
				"user_id": userID,
			})
		} else {
			// Refresh profile after reset
			profile, err = s.db.GetProfile(ctx, userID)
			if err != nil {
				return false, "", fmt.Errorf("failed to get refreshed profile: %w", err)
			}
		}
	}

	// Check credit availability based on billing model
	if profile.FreeImagesRemaining > 0 {
		return true, "free", nil
	}

	if profile.BulkImagesRemaining > 0 {
		return true, "bulk", nil
	}

	if profile.CurrentBillingModel == "pay_as_you_go" {
		return true, "payg", nil
	}

	return false, "", nil
}

// ResetFreeCredits resets the monthly free credit allowance
func (s *BillingService) ResetFreeCredits(ctx context.Context, userID string) error {
	updates := map[string]interface{}{
		"free_images_remaining": 50,
		"free_images_reset_at":  time.Now().AddDate(0, 1, 0), // Next month
	}

	err := s.db.UpdateProfile(ctx, userID, updates)
	if err != nil {
		return fmt.Errorf("failed to reset free credits: %w", err)
	}

	logger.GetGlobalLogger().Info().
		Str("user_id", userID).
		Msg("Free credits reset successfully")

	return nil
}

// UpgradeToBulk upgrades a user to bulk package billing
func (s *BillingService) UpgradeToBulk(ctx context.Context, userID string, bulkCredits int) error {
	updates := map[string]interface{}{
		"current_billing_model":  "bulk_package",
		"bulk_images_remaining":  bulkCredits,
	}

	err := s.db.UpdateProfile(ctx, userID, updates)
	if err != nil {
		return fmt.Errorf("failed to upgrade to bulk package: %w", err)
	}

	logger.GetGlobalLogger().Info().
		Str("user_id", userID).
		Int("bulk_credits", bulkCredits).
		Msg("User upgraded to bulk package")

	return nil
}

// UpgradeToPayAsYouGo upgrades a user to pay-as-you-go billing
func (s *BillingService) UpgradeToPayAsYouGo(ctx context.Context, userID, stripeCustomerID string) error {
	updates := map[string]interface{}{
		"current_billing_model": "pay_as_you_go",
		"stripe_customer_id":    stripeCustomerID,
	}

	err := s.db.UpdateProfile(ctx, userID, updates)
	if err != nil {
		return fmt.Errorf("failed to upgrade to pay-as-you-go: %w", err)
	}

	logger.GetGlobalLogger().Info().
		Str("user_id", userID).
		Str("stripe_customer_id", stripeCustomerID).
		Msg("User upgraded to pay-as-you-go")

	return nil
}

// GetUsageStats returns usage statistics for billing and analytics
func (s *BillingService) GetUsageStats(ctx context.Context, userID string, days int) (map[string]interface{}, error) {
	stats, err := s.db.GetUserStats(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get usage stats: %w", err)
	}

	// Add billing-specific information
	billingInfo, err := s.GetBillingInfo(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get billing info: %w", err)
	}

	stats["billing_info"] = billingInfo

	return stats, nil
}