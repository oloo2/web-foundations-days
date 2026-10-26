# SnapShare: Photo-App Scaling Plan

## Assumptions and workload estimates

- SnapShare has 10 million registered users, and 10% are active on a typical day.
- Each daily active user uploads one photo and requests 50 feed pages per day.
- A day has 86,400 seconds and a year has 365 days. Rates below are averages across the full day; feed peak is estimated at five times its average.
- Photo sizes are decimal: one original is 2 MB and its thumbnail is 50 KB. Every upload is retained for a year, with no allowance for replication, backups, metadata, or storage overhead.
- “Feed views” means feed-page requests, not individual photo/image requests. Image delivery can be higher depending on how many photos each page displays.

Daily active users (DAU):

`10,000,000 registered users × 10% = 1,000,000 DAU`

| Workload                 | Calculation                                                     |                                   Estimate |
| ------------------------ | --------------------------------------------------------------- | -----------------------------------------: |
| Photo uploads            | 1,000,000 uploads/day ÷ 86,400 seconds/day                      |            **11.6 uploads/second average** |
| Feed-page views          | 1,000,000 users × 50 pages/day = 50,000,000 pages/day; ÷ 86,400 |               **579 views/second average** |
| Peak feed-page views     | 579 × 5                                                         |          **about 2,894 views/second peak** |
| Original photo storage   | 1,000,000 × 2 MB × 365                                          |      **730,000,000 MB/year = 730 TB/year** |
| Thumbnail storage        | 1,000,000 × 50 KB × 365                                         | **18,250,000,000 KB/year = 18.25 TB/year** |
| Total photo-file storage | Originals + thumbnails                                          |         **about 748.25 TB/year (0.75 PB)** |

These storage figures are the additional files produced in one year, not the total retained after multiple years. They use decimal units (1 TB = 1,000,000 MB); actual capacity needs will be higher once replication, backups, and operational overhead are included.

## Read or write heavy?

SnapShare is **read-heavy**: users request 50 feed pages for every one photo they upload, and each feed page can also lead to multiple image downloads. The design should scale feed reads independently, cache frequently requested feed data and images, and use a CDN to serve photo bytes close to users; writes still need durable storage and reliable background processing.

## Where photo files belong

Store photo files in **object storage**, not inside the database. Large binary files would inflate database size, backups, replication, and I/O costs, while object storage is designed for durable, cost-effective file storage and can serve files through a CDN. Keep searchable application data—such as photo IDs, owner, caption, timestamps, visibility, and object keys—in the database.

## Architecture

```text
                                      +------------------+
                           cache miss |       CDN        |
                    +--------------->| photo delivery   |
                    |                +--------+---------+
                    |                         | origin fetch
                    |                         v
+--------+  photo   |                  +------+---------+
| Clients|--upload via signed URL----->| Object storage |
|        |                             | originals and  |
|        |<----------------------------| thumbnails     |
+---+----+        CDN photo URLs       +------+---------+
    |                                        ^   ^
    | API/feed                               |   | read original /
    v                                        |   | write thumbnail
+---+--------------+    +---------------+   |   |
| Load balancer    |--->| App servers   |---+   |
+------------------+    +---+-------+---+       |
                            |       |            |
                            |       +-------> +--+-------+    +------------------+
                            | enqueue job    | Queue    |--->| Thumbnail worker|
                            |                +----------+    +--------+---------+
                            |                                         |
                     +------v------+                          update photo metadata
                     | Cache       |                                  |
                     | feed data   |                                  |
                     +-------------+                                  |
                            ^                                         |
                            |                                         v
                     +------+-------+ <-------------------------------+
                     | Database     |
                     | primary      |
                     +------+-------+
                            | replication
                            v
                     +------+-------+
                     | Read replica |
                     +--------------+
```

## Component responsibilities

- **CDN:** Delivers cached photo and thumbnail files near users, reducing image latency and origin bandwidth.
- **Load balancer:** Distributes API requests across healthy app servers so capacity can grow horizontally.
- **App servers:** Authenticate requests, issue upload permissions, manage photo metadata, and assemble feed responses.
- **Cache:** Keeps frequently requested feed data or metadata available without querying the database on every request.
- **Database primary:** Durably stores user, relationship, and photo metadata and accepts application writes.
- **Database read replica:** Serves eligible read queries to scale feed-related database reads while the primary handles writes.
- **Object storage:** Stores original photo and thumbnail bytes separately from relational/application data.
- **Queue:** Durably buffers thumbnail jobs so upload requests do not have to wait for image processing and temporary worker slowdowns do not lose jobs.
- **Thumbnail worker:** Processes queued jobs, creates the 50 KB thumbnail, stores it in object storage, and marks the metadata as ready.

## Photo upload flow

1. The client asks the app servers to start an upload; the app authenticates the user, validates the request, and creates a photo record with a pending status.
2. The app returns a short-lived signed upload URL for the original photo's object-storage key, so the client can send the large file directly to object storage rather than through an app server.
3. The client uploads the original photo to object storage using that URL.
4. After the upload succeeds, the client notifies the app (or object-storage upload events trigger the same action); the app verifies the upload and enqueues a thumbnail job containing the photo ID and object key.
5. A thumbnail worker picks up the job, reads the original from object storage, creates a 50 KB thumbnail, and writes the thumbnail back to object storage.
6. The worker updates the photo metadata/status in the database; the app can now include the photo in feeds, and clients receive CDN URLs for the original and thumbnail.

## Trade-offs

- **Direct-to-object-storage uploads** reduce app-server bandwidth and make large uploads easier to scale, but require signed-URL handling and a reliable way to confirm that each upload completed before publishing it.
- **Asynchronous thumbnail generation** keeps uploads responsive and lets worker capacity scale separately, but thumbnails are not immediately available and the system needs retries and monitoring for failed jobs.
- **Caching and a read replica** reduce primary-database load and improve read throughput, but cached feeds can be briefly stale and replica replication lag means some reads may not immediately reflect a new upload.
- **A CDN** reduces image latency and origin traffic, but introduces cache invalidation/expiry decisions and can make photo deletion or privacy changes take time to propagate unless cache controls are designed carefully.
