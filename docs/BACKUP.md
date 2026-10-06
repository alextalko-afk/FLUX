# Backup and restore

Two things hold state: PostgreSQL (`postgres_data`) and the object store (`seaweedfs_data`: files, avatars, voice, video). Redis holds only caches and queues (job loss is tolerable).

## Back up
```bash
scripts/backup.sh [dir]     # default ./backups; keeps KEEP_DAYS=14 days
```
Creates `db-<stamp>.dump` (`pg_dump -Fc`) and `files-<stamp>.tar.gz`. Uses `docker-compose.prod.yml` and `.env.prod`; override with `COMPOSE_FILE` / `ENV_FILE`.

Nightly, via cron (`crontab -e`):
```
0 3 * * * cd /opt/flux && scripts/backup.sh /var/backups/flux >> /var/log/flux-backup.log 2>&1
```
Copy the directory off the server (rsync/rclone to another host or bucket). A backup on the same disk is not a backup.

## Restore
```bash
scripts/restore.sh db-<stamp>.dump [files-<stamp>.tar.gz]
```
Asks for confirmation, stops the API, replaces the database (`pg_restore --clean`), optionally unpacks the files, and starts the API again. Restore the dump and the files from the same moment.

## Verify
Restore into a scratch database regularly:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres sh -c 'createdb -U "$POSTGRES_USER" scratch'
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d scratch --no-owner' < db-<stamp>.dump
```
Keep `.env.prod` in a safe place too: without `JWT_*`/`PASSCODE_PEPPER` the restored data is not usable the same way.
