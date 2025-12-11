# Frontend API Documentation

## Authentication
All endpoints require Bearer token authentication.
```
Authorization: Bearer <token>
```

---

## Live Content APIs

### 1. Create Live Content
**POST** `/live-content/create`

Create a new live content (streaming, website, iframe, youtube, or custom content).

**Request Body:**
```json
{
  "name": "Office Hours Live Stream",
  "content_type": "streaming",
  "url": "https://stream.example.com/live",
  "duration": 0,
  "start_time": "2024-12-10T09:00:00Z",
  "end_time": "2024-12-10T18:00:00Z",
  "config": {
    "autoplay": true,
    "mute": false,
    "loop": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Name of the live content |
| content_type | string | No | One of: `streaming`, `website`, `iframe`, `youtube`, `custom`. Default: `website` |
| url | string | Yes | URL for the content |
| duration | number | No | Duration in seconds. `0` = indefinite. Default: `0` |
| start_time | string (ISO 8601) | No | When to start showing this content |
| end_time | string (ISO 8601) | No | When to stop showing this content |
| config | object | No | Additional configuration (autoplay, mute, loop, etc.) |

**Response (201):**
```json
{
  "message": "Live content created successfully",
  "data": {
    "live_content_id": "uuid",
    "client_id": "uuid",
    "name": "Office Hours Live Stream",
    "content_type": "streaming",
    "url": "https://stream.example.com/live",
    "duration": 0,
    "start_time": "2024-12-10T09:00:00.000Z",
    "end_time": "2024-12-10T18:00:00.000Z",
    "status": "active",
    "config": { "autoplay": true, "mute": false, "loop": false },
    "created_at": "2024-12-05T10:00:00.000Z",
    "updated_at": "2024-12-05T10:00:00.000Z"
  }
}
```

---

### 2. Get All Live Content
**GET** `/live-content/all`

Returns all live content for the authenticated client.

**Response (200):**
```json
{
  "data": [
    {
      "live_content_id": "uuid",
      "name": "Office Hours Live Stream",
      "content_type": "streaming",
      "url": "https://stream.example.com/live",
      "duration": 0,
      "start_time": "2024-12-10T09:00:00.000Z",
      "end_time": "2024-12-10T18:00:00.000Z",
      "status": "active",
      "config": {},
      "Client": { "name": "Client Name" }
    }
  ]
}
```

---

### 3. Get Live Content by ID
**GET** `/live-content/:id`

**Response (200):**
```json
{
  "data": {
    "live_content_id": "uuid",
    "name": "Office Hours Live Stream",
    "content_type": "streaming",
    "url": "https://stream.example.com/live",
    "duration": 0,
    "start_time": "2024-12-10T09:00:00.000Z",
    "end_time": "2024-12-10T18:00:00.000Z",
    "status": "active",
    "config": {},
    "Client": { "name": "Client Name" }
  }
}
```

---

### 4. Update Live Content
**PUT** `/live-content/:id`

**Request Body:** (all fields optional)
```json
{
  "name": "Updated Name",
  "content_type": "youtube",
  "url": "https://youtube.com/watch?v=xyz",
  "duration": 300,
  "start_time": "2024-12-11T09:00:00Z",
  "end_time": "2024-12-11T18:00:00Z",
  "config": { "autoplay": true },
  "status": "inactive"
}
```

**Response (200):**
```json
{
  "message": "Live content updated successfully",
  "data": { ... }
}
```

---

### 5. Delete Live Content
**DELETE** `/live-content/:id`

**Response (200):**
```json
{
  "message": "Live content deleted successfully"
}
```

---

## Carousel APIs

### 1. Create Carousel
**POST** `/carousel/create`

Create a carousel with multiple ads. Each item can be an **existing ad** or a **new ad upload**.

**Request Body:**
```json
{
  "name": "Holiday Sale Carousel",
  "items": [
    {
      "ad_id": "existing-ad-uuid-1",
      "display_order": 1
    },
    {
      "name": "New Holiday Ad",
      "duration": 15,
      "file_url": "s3://bucket/path/to/video.mp4",
      "display_order": 2
    },
    {
      "ad_id": "existing-ad-uuid-2",
      "display_order": 3
    }
  ]
}
```

**Item Options:**

| Option | Fields Required | Description |
|--------|-----------------|-------------|
| Existing Ad | `ad_id`, `display_order` | Use an ad that already exists |
| New Ad | `name`, `duration`, `file_url`, `display_order` | Create a new ad and add to carousel |

**Response (201):**
```json
{
  "message": "Carousel created successfully",
  "data": {
    "carousel_id": "uuid",
    "client_id": "uuid",
    "name": "Holiday Sale Carousel",
    "status": "active",
    "total_duration": 45,
    "items": [
      { "carousel_item_id": "uuid", "ad_id": "uuid", "display_order": 1 },
      { "carousel_item_id": "uuid", "ad_id": "uuid", "display_order": 2 },
      { "carousel_item_id": "uuid", "ad_id": "uuid", "display_order": 3 }
    ],
    "new_ads_created": [
      { "ad_id": "uuid", "name": "New Holiday Ad" }
    ]
  }
}
```

> **Note:** New ads are created with `status: "processing"`. Lambda is triggered for media conversion.

---

### 2. Get All Carousels
**GET** `/carousel/all`

Returns all carousels with their items and ad details.

**Response (200):**
```json
{
  "data": [
    {
      "carousel_id": "uuid",
      "name": "Holiday Sale Carousel",
      "status": "active",
      "total_duration": 45,
      "Client": { "name": "Client Name" },
      "items": [
        {
          "carousel_item_id": "uuid",
          "display_order": 1,
          "Ad": {
            "ad_id": "uuid",
            "name": "Ad 1",
            "url": "https://cdn.example.com/ad1.mp4",
            "duration": 15
          }
        }
      ]
    }
  ]
}
```

---

### 3. Get Carousel by ID
**GET** `/carousel/:id`

**Response (200):**
```json
{
  "data": {
    "carousel_id": "uuid",
    "name": "Holiday Sale Carousel",
    "status": "active",
    "total_duration": 45,
    "Client": { "name": "Client Name" },
    "items": [
      {
        "carousel_item_id": "uuid",
        "display_order": 1,
        "Ad": {
          "ad_id": "uuid",
          "name": "Ad 1",
          "url": "https://cdn.example.com/ad1.mp4",
          "duration": 15,
          "status": "active"
        }
      }
    ]
  }
}
```

---

### 4. Update Carousel
**PUT** `/carousel/:id`

Update carousel name, status, or replace all items. Items support both existing ads and new uploads.

**Request Body:**
```json
{
  "name": "Updated Carousel Name",
  "status": "inactive",
  "items": [
    { "ad_id": "existing-ad-uuid", "display_order": 1 },
    { "name": "New Ad", "duration": 10, "file_url": "s3://...", "display_order": 2 }
  ]
}
```

**Response (200):**
```json
{
  "message": "Carousel updated successfully"
}
```

---

### 5. Delete Carousel
**DELETE** `/carousel/:id`

**Response (200):**
```json
{
  "message": "Carousel deleted successfully"
}
```

---

## Schedule Content API

### Schedule Ad, Live Content, or Carousel
**POST** `/schedule/create`

Schedule any content type (ad, live_content, or carousel) for device groups.

**Request Body:**
```json
{
  "content_id": "uuid-of-content",
  "content_type": "carousel",
  "start_time": "2024-12-10T00:00:00Z",
  "end_time": "2024-12-15T23:59:59Z",
  "total_duration": 300,
  "priority": 1,
  "groups": ["group-uuid-1", "group-uuid-2"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content_id | string (UUID) | Yes | ID of the content (ad_id, live_content_id, or carousel_id) |
| content_type | string | No | One of: `ad`, `live_content`, `carousel`. Default: `ad` |
| ad_id | string (UUID) | No | **Legacy:** Use `content_id` instead. Still supported for backward compatibility |
| start_time | string (ISO 8601) | Yes | Schedule start date/time |
| end_time | string (ISO 8601) | Yes | Schedule end date/time |
| total_duration | number | Yes | Duration for playback in seconds |
| priority | number | Yes | Priority level (lower = higher priority) |
| groups | array of UUIDs | Yes | Device group IDs to schedule for |

**Examples:**

**Schedule an Ad:**
```json
{
  "content_id": "ad-uuid",
  "content_type": "ad",
  "start_time": "2024-12-10T09:00:00Z",
  "end_time": "2024-12-10T18:00:00Z",
  "total_duration": 300,
  "priority": 1,
  "groups": ["group-uuid"]
}
```

**Schedule a Live Content:**
```json
{
  "content_id": "live-content-uuid",
  "content_type": "live_content",
  "start_time": "2024-12-10T09:00:00Z",
  "end_time": "2024-12-10T18:00:00Z",
  "total_duration": 3600,
  "priority": 1,
  "groups": ["group-uuid"]
}
```

**Schedule a Carousel:**
```json
{
  "content_id": "carousel-uuid",
  "content_type": "carousel",
  "start_time": "2024-12-10T09:00:00Z",
  "end_time": "2024-12-15T18:00:00Z",
  "total_duration": 60,
  "priority": 2,
  "groups": ["group-uuid-1", "group-uuid-2"]
}
```

**Response (201):**
```json
{
  "message": "Ad scheduled successfully",
  "data": {
    "schedulesCreated": 5,
    "affectedGroups": ["group-uuid-1", "group-uuid-2"]
  }
}
```

---

## Content Types Reference

| Content Type | Description | Use Case |
|--------------|-------------|----------|
| `ad` | Single advertisement | Standard ad playback |
| `live_content` | Live/dynamic content | Streaming, websites, iframes, YouTube |
| `carousel` | Collection of multiple ads | Rotating ad sequence |

### Live Content Types

| Type | Description |
|------|-------------|
| `streaming` | Live video stream (RTMP, HLS, etc.) |
| `website` | Full webpage display |
| `iframe` | Embedded iframe content |
| `youtube` | YouTube video/stream |
| `custom` | Custom content type |

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Missing or invalid parameters |
| 401 | Unauthorized - Invalid or missing token |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

