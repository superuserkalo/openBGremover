package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

    "github.com/superuserkalo/OpenBGRemover/go-api/pkg/config"
    "github.com/superuserkalo/OpenBGRemover/go-api/errors"
    "github.com/superuserkalo/OpenBGRemover/go-api/pkg/models"
    "github.com/superuserkalo/OpenBGRemover/go-api/pkg/validation"
)

// BackgroundRemovalService handles background removal operations
type BackgroundRemovalService struct {
	config *config.Config
	client *http.Client
}

// NewBackgroundRemovalService creates a new background removal service
func NewBackgroundRemovalService(cfg *config.Config) *BackgroundRemovalService {
	return &BackgroundRemovalService{
		config: cfg,
		client: &http.Client{
			Timeout: cfg.Beam.Timeout,
			Transport: &http.Transport{
				MaxIdleConns:        10,
				MaxIdleConnsPerHost: 2,
				IdleConnTimeout:     30 * time.Second,
			},
		},
	}
}

// ProcessImage processes an image using the Beam API
func (s *BackgroundRemovalService) ProcessImage(ctx context.Context, req *models.APIRequest) (*models.APIResponse, error) {
	startTime := time.Now()

	// Validate request
	if err := s.validateRequest(req); err != nil {
		return nil, err
	}

	// Set defaults
	s.setDefaults(req)

	// Build Beam request
	beamReq := &models.BeamRequest{
		Image:      req.ImageData,
		Quality:    req.Quality,
		Format:     req.Format,
		ReturnMask: req.ReturnMask,
		Resize:     req.ResizeOptions,
		Debug:      s.config.IsDevelopment(),
	}

	// Call Beam API
	beamResp, err := s.callBeamAPI(ctx, beamReq)
	if err != nil {
		return nil, err
	}

	// Handle Beam response errors
	if !beamResp.Success {
		errorCode := beamResp.Code
		if errorCode == "" {
			errorCode = "PROCESSING_ERROR"
		}
		return &models.APIResponse{
			Success:   false,
			Error:     beamResp.Error,
			ErrorCode: errorCode,
		}, nil
	}

	// Build successful response
	processingTime := time.Since(startTime).Milliseconds()
	response := &models.APIResponse{
		Success:        true,
		ResultImage:    beamResp.Image,
		MaskImage:      beamResp.Mask,
		ProcessingTime: processingTime,
		Metadata:       beamResp.Metadata,
	}

	// Add gateway metadata
	if response.Metadata == nil {
		response.Metadata = make(map[string]interface{})
	}
	response.Metadata["gateway_processing_time_ms"] = processingTime
	if beamResp.Metadata != nil {
		if beamTime, ok := beamResp.Metadata["processing_time_ms"]; ok {
			response.Metadata["beam_processing_time_ms"] = beamTime
		}
	}

	return response, nil
}

// validateRequest validates the API request
func (s *BackgroundRemovalService) validateRequest(req *models.APIRequest) error {
	// Validate image data
	if err := validation.ValidateImageData(req.ImageData); err != nil {
		return err
	}

	// Validate quality parameter
	if err := validation.ValidateQuality(req.Quality); err != nil {
		return err
	}

	// Validate format parameter
	if err := validation.ValidateFormat(req.Format); err != nil {
		return err
	}

	return nil
}

// setDefaults sets default values for the request
func (s *BackgroundRemovalService) setDefaults(req *models.APIRequest) {
	if req.Quality == "" {
		req.Quality = "auto"
	}
	if req.Format == "" {
		req.Format = "png"
	}
}


// callBeamAPI makes a request to the Beam API
func (s *BackgroundRemovalService) callBeamAPI(ctx context.Context, req *models.BeamRequest) (*models.BeamResponse, error) {
	reqBody, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", s.config.Beam.EndpointURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Authorization", "Bearer "+s.config.Beam.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "background-removal-gateway/2.0.0")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, errors.ErrTimeout
		}
		return nil, fmt.Errorf("failed to call beam API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("beam API returned status %d: %s", resp.StatusCode, string(body))
	}

	var beamResp models.BeamResponse
	if err := json.Unmarshal(body, &beamResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &beamResp, nil
}

// GetSupportedFormats returns the list of supported formats
func (s *BackgroundRemovalService) GetSupportedFormats() []string {
	return []string{"png", "jpg", "jpeg", "webp", "gif"}
}

// GetQualityPresets returns the list of quality presets
func (s *BackgroundRemovalService) GetQualityPresets() []string {
	return []string{"auto", "quality", "portrait", "product", "speed"}
}
