# #!/bin/bash
# set -e

# DB_NAME="consoledb"
# DB_USER="postgres"
# S3_BUCKET="your-s3-bucket"
# TMP_DIR="/tmp/pop_archive"
# S3_PREFIX="proof-of-play-archive"

# mkdir -p $TMP_DIR

# echo "🚀 Starting ProofOfPlayLogs cold archival..."

# psql -U $DB_USER -d $DB_NAME -t -c "
# SELECT tablename
# FROM pg_tables
# WHERE tablename LIKE 'ProofOfPlayLogs_%'
# AND to_date(substring(tablename from '([0-9]{4}_[0-9]{2})'), 'YYYY_MM')
#     < date_trunc('month', CURRENT_DATE - interval '3 months');
# " | while read table
# do
#   table=$(echo $table | xargs)
#   [ -z "$table" ] && continue

#   echo "📦 Archiving $table"

#   FILE="$TMP_DIR/$table.csv.gz"

#   psql -U $DB_USER -d $DB_NAME -c \
#     "\copy $table TO PROGRAM 'gzip > $FILE' CSV HEADER"

#   aws s3 cp $FILE s3://$S3_BUCKET/$S3_PREFIX/$table.csv.gz

#   # verify upload
#   aws s3 ls s3://$S3_BUCKET/$S3_PREFIX/$table.csv.gz >/dev/null

#   echo "✅ Uploaded $table to S3"

#   # drop partition
#   psql -U $DB_USER -d $DB_NAME -c "DROP TABLE $table;"

#   echo "🗑️ Dropped $table from Postgres"

# done

# echo "🎉 Cold archival completed successfully"



#!/bin/bash
set -e

export AWS_ACCESS_KEY_ID=""
export AWS_SECRET_ACCESS_KEY=""
export AWS_DEFAULT_REGION="ap-south-1"

DB_NAME="consoledbb"
S3_BUCKET="waterbilles"
TMP_DIR="/tmp/log_archive"
S3_PREFIX="ad96-pop/logs-archive"

sudo mkdir -p $TMP_DIR

echo "🚀 Starting cold archival for all log tables..."

TABLE_PREFIXES=(
  "proofofplaylogs"
  "devicetelemetrylogs"
  "deviceeventlogs"
)

for PREFIX in "${TABLE_PREFIXES[@]}"
do
  echo "🔎 Checking partitions for $PREFIX..."

  sudo psql -h localhost -d $DB_NAME -U "consoleuser" -t -c "
  SELECT tablename
  FROM pg_tables
  WHERE schemaname='public'
  AND tablename LIKE '${PREFIX}_%'
  AND to_date(substring(tablename from '([0-9]{4}_[0-9]{2})'), 'YYYY_MM')
      < date_trunc('month', CURRENT_DATE - interval '3 months');
  " | while read table
  do
    table=$(echo $table | xargs)
    [ -z "$table" ] && continue

    echo "📦 Archiving $table"

    FILE="$TMP_DIR/$table.csv.gz"

    cd /tmp
    sudo -u postgres psql -d $DB_NAME -c "\copy $table TO PROGRAM 'gzip > $FILE' CSV HEADER"

    aws s3 cp "$FILE" "s3://$S3_BUCKET/$S3_PREFIX/$table.csv.gz"

    echo "✅ Uploaded $table to S3"

    # Uncomment if you want to delete partition after archive
    # sudo -u postgres psql -d $DB_NAME -c "DROP TABLE IF EXISTS $table;"
    # echo "🗑️ Dropped $table"

    sudo rm -f "$FILE"

  done

done

echo "🎉 Cold archival completed successfully"