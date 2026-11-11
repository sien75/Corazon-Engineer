# GET /blobs/{sha256}

Read back a stored image by its content address, as raw bytes

## Request

```yaml
body:
  sha256: string  # content address — it is the path segment of /blobs/{sha256}
```

## Response

```yaml
status: 200
body: bytes  # the raw image itself, not yaml; Content-Type is the mime it was stored with, Cache-Control is public, max-age=31536000, immutable
```

## Errors

```yaml
- status: 404
  code: not_found
  description: no blob is stored under that address
```
