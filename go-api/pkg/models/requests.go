package models

// BeamRequest represents a request to the Beam API
type BeamRequest struct {
	Image      string                 `json:"image"`
	Quality    string                 `json:"quality,omitempty"`
	Format     string                 `json:"format,omitempty"`
	ReturnMask bool                   `json:"return_mask,omitempty"`
	Resize     map[string]interface{} `json:"resize,omitempty"`
	Debug      bool                   `json:"debug,omitempty"`
}

// BeamResponse represents a response from the Beam API
type BeamResponse struct {
	Success  bool                   `json:"success"`
	Image    string                 `json:"image,omitempty"`
	Mask     string                 `json:"mask,omitempty"`
	TaskID   string                 `json:"task_id,omitempty"`
	Error    string                 `json:"error,omitempty"`
	Code     string                 `json:"code,omitempty"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

// APIRequest represents the SDK-friendly API request
type APIRequest struct {
	ImageData     string                 `json:"image_data" binding:"required"`
	Quality       string                 `json:"quality"`
	Format        string                 `json:"format"`
	ReturnMask    bool                   `json:"return_mask"`
	ResizeOptions map[string]interface{} `json:"resize_options,omitempty"`
}

// APIResponse represents the SDK-friendly API response
type APIResponse struct {
	Success        bool                   `json:"success"`
	ResultImage    string                 `json:"result_image,omitempty"`
	MaskImage      string                 `json:"mask_image,omitempty"`
	Error          string                 `json:"error,omitempty"`
	ErrorCode      string                 `json:"error_code,omitempty"`
	ProcessingTime int64                  `json:"processing_time_ms,omitempty"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

// CreateAPIKeyRequest represents a request to create an API key
type CreateAPIKeyRequest struct {
	Name string `json:"name" binding:"required"`
}

// CreateAPIKeyResponse represents a response when creating an API key
type CreateAPIKeyResponse struct {
	Success bool   `json:"success"`
	APIKey  string `json:"api_key,omitempty"`
	KeyID   int64  `json:"key_id,omitempty"`
	Error   string `json:"error,omitempty"`
}

// APIKeyListResponse represents a response listing API keys
type APIKeyListResponse struct {
	Success bool      `json:"success"`
	Keys    []APIKey  `json:"keys,omitempty"`
	Error   string    `json:"error,omitempty"`
}

// APIKey represents an API key for list responses (without sensitive data)
type APIKey struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	LastUsed   *int64 `json:"last_used_at,omitempty"`
	IsActive   bool   `json:"is_active"`
	CreatedAt  int64  `json:"created_at"`
}

// StatsResponse represents user statistics
type StatsResponse struct {
	Success           bool   `json:"success"`
	ImagesProcessed   int    `json:"images_processed"`
	ImagesThisMonth   int    `json:"images_this_month"`
	FreeCredits       int    `json:"free_credits_remaining"`
	BulkCredits       int    `json:"bulk_credits_remaining"`
	BillingModel      string `json:"billing_model"`
	Error             string `json:"error,omitempty"`
}

// ActivityResponse represents user activity
type ActivityResponse struct {
	Success    bool                   `json:"success"`
	Activities []ActivityEntry       `json:"activities,omitempty"`
	Pagination map[string]interface{} `json:"pagination,omitempty"`
	Error      string                 `json:"error,omitempty"`
}

// ActivityEntry represents a single activity entry
type ActivityEntry struct {
	ID               int64  `json:"id"`
	Source           string `json:"source"`
	WasSuccessful    bool   `json:"was_successful"`
	ErrorMessage     string `json:"error_message,omitempty"`
	ProcessingTimeMs int    `json:"processing_time_ms,omitempty"`
	CreditType       string `json:"credit_type,omitempty"`
	CreatedAt        int64  `json:"created_at"`
}