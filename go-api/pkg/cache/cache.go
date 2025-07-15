package cache

import (
	"sync"
	"time"
)

// CacheItem represents a cached item with expiration
type CacheItem struct {
	Data      []byte
	ExpiresAt time.Time
}

// IsExpired checks if the cache item has expired
func (c *CacheItem) IsExpired() bool {
	return time.Now().After(c.ExpiresAt)
}

// MemoryCache is a simple in-memory cache
type MemoryCache struct {
	items   map[string]*CacheItem
	mutex   sync.RWMutex
	cleanup chan struct{}
}

// NewMemoryCache creates a new in-memory cache
func NewMemoryCache() *MemoryCache {
	cache := &MemoryCache{
		items:   make(map[string]*CacheItem),
		cleanup: make(chan struct{}),
	}

	// Start cleanup goroutine
	go cache.cleanupExpiredItems()

	return cache
}

// Get retrieves an item from the cache
func (m *MemoryCache) Get(key string) ([]byte, bool) {
	m.mutex.RLock()
	item, exists := m.items[key]
	m.mutex.RUnlock()

	if !exists || item.IsExpired() {
		return nil, false
	}

	return item.Data, true
}

// Set stores an item in the cache with TTL
func (m *MemoryCache) Set(key string, data []byte, ttl time.Duration) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	m.items[key] = &CacheItem{
		Data:      data,
		ExpiresAt: time.Now().Add(ttl),
	}
}

// Delete removes an item from the cache
func (m *MemoryCache) Delete(key string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	delete(m.items, key)
}

// Clear removes all items from the cache
func (m *MemoryCache) Clear() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	m.items = make(map[string]*CacheItem)
}

// cleanupExpiredItems removes expired items from the cache
func (m *MemoryCache) cleanupExpiredItems() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.mutex.Lock()
			now := time.Now()
			for key, item := range m.items {
				if now.After(item.ExpiresAt) {
					delete(m.items, key)
				}
			}
			m.mutex.Unlock()
		case <-m.cleanup:
			return
		}
	}
}

// Close shuts down the cache
func (m *MemoryCache) Close() {
	close(m.cleanup)
}

// Size returns the number of items in the cache
func (m *MemoryCache) Size() int {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return len(m.items)
}