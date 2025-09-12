package handlers

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/superuserkalo/OpenBGRemover/go-api/database"
    "github.com/superuserkalo/OpenBGRemover/go-api/errors"
)

// BillingHandler provides minimal billing actions for MVP
type BillingHandler struct {
    db *database.DB
}

func NewBillingHandler(db *database.DB) *BillingHandler {
    return &BillingHandler{db: db}
}

type upgradeRequest struct {
    Plan      string `json:"plan"`               // "payg" | "bulk"
    Package   string `json:"package,omitempty"`  // "starter" | "pro" | "enterprise"
    Recurring bool   `json:"recurring,omitempty"`
}

// HandleUpgrade switches billing model or adds bulk credits (MVP, no Stripe yet)
func (h *BillingHandler) HandleUpgrade(c *gin.Context) {
    userID, exists := c.Get("userID")
    if !exists {
        c.Error(errors.ErrUnauthorized)
        return
    }

    var req upgradeRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.Error(errors.NewAPIError("INVALID_REQUEST", err.Error(), http.StatusBadRequest))
        return
    }

    // Load current profile to compute updates safely
    profile, err := h.db.GetProfile(c.Request.Context(), userID.(string))
    if err != nil {
        c.Error(errors.NewAPIError("PROFILE_ERROR", "Failed to load profile", http.StatusInternalServerError))
        return
    }

    updates := map[string]interface{}{}

    switch req.Plan {
    case "payg":
        updates["current_billing_model"] = "pay_as_you_go"
        // For MVP we don't require a Stripe customer yet.

    case "bulk":
        updates["current_billing_model"] = "bulk_package"
        // MVP: add credits based on a simple package selection
        add := 0
        switch req.Package {
        case "starter":
            add = 1000
        case "pro":
            add = 10000
        case "enterprise":
            add = 100000
        default:
            // fallback starter if unspecified
            add = 1000
        }
        // Compute new total and set explicit value (UpdateProfile sets column values, not expressions)
        updates["bulk_images_remaining"] = profile.BulkImagesRemaining + add

    default:
        c.Error(errors.NewAPIError("INVALID_PLAN", "Plan must be 'payg' or 'bulk'", http.StatusBadRequest))
        return
    }

    if err := h.db.UpdateProfile(c.Request.Context(), userID.(string), updates); err != nil {
        c.Error(errors.NewAPIError("BILLING_UPDATE_FAILED", "Failed to update billing", http.StatusInternalServerError))
        return
    }

    c.JSON(http.StatusOK, gin.H{
        "success":  true,
        "plan":     req.Plan,
        "package":  req.Package,
        "recurring": req.Recurring,
    })
}
