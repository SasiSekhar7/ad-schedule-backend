#!/bin/bash
set -e

DB_NAME="consoledb"
DB_USER="postgres"
S3_BUCKET="your-s3-bucket"
TMP_DIR="/tmp/pop_archive"
S3_PREFIX="proof-of-play-archive"

mkdir -p $TMP_DIR

echo "🚀 Starting ProofOfPlayLogs cold archival..."

psql -U $DB_USER -d $DB_NAME -t -c "
SELECT tablename
FROM pg_tables
WHERE tablename LIKE 'ProofOfPlayLogs_%'
AND to_date(substring(tablename from '([0-9]{4}_[0-9]{2})'), 'YYYY_MM')
    < date_trunc('month', CURRENT_DATE - interval '3 months');
" | while read table
do
  table=$(echo $table | xargs)
  [ -z "$table" ] && continue

  echo "📦 Archiving $table"

  FILE="$TMP_DIR/$table.csv.gz"

  psql -U $DB_USER -d $DB_NAME -c \
    "\copy $table TO PROGRAM 'gzip > $FILE' CSV HEADER"

  aws s3 cp $FILE s3://$S3_BUCKET/$S3_PREFIX/$table.csv.gz

  # verify upload
  aws s3 ls s3://$S3_BUCKET/$S3_PREFIX/$table.csv.gz >/dev/null

  echo "✅ Uploaded $table to S3"

  # drop partition
  psql -U $DB_USER -d $DB_NAME -c "DROP TABLE $table;"

  echo "🗑️ Dropped $table from Postgres"

done

echo "🎉 Cold archival completed successfully"