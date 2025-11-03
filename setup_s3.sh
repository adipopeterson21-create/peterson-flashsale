
#!/bin/bash
# setup_s3.sh - Create S3 bucket and IAM user for uploads (least-privilege).
# USAGE: ./setup_s3.sh <aws-region> <bucket-name>
REGION="$1"
BUCKET="$2"
if [ -z "$REGION" ] || [ -z "$BUCKET" ]; then
  echo "Usage: $0 <aws-region> <bucket-name>"
  echo "Example: $0 af-south-1 flashsale-media-$(date +%s)"
  exit 1
fi

set -e

echo "Creating S3 bucket $BUCKET in region $REGION..."
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"

echo "Creating a bucket policy to allow public read of objects (adjust if you want private)"
cat > /tmp/public_policy.json <<POL
{
  "Version":"2012-10-17",
  "Statement":[{
    "Sid":"PublicReadGetObject",
    "Effect":"Allow",
    "Principal":"*",
    "Action":["s3:GetObject"],
    "Resource":["arn:aws:s3:::%BUCKET%/*"]
  }]
}
POL
sed -i "s/%BUCKET%/$BUCKET/g" /tmp/public_policy.json
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file:///tmp/public_policy.json --region "$REGION"

echo "Creating IAM user ${BUCKET}-uploader with programmatic access..."
aws iam create-user --user-name "${BUCKET}-uploader" || true

# Create a policy JSON with least privilege for this bucket only
cat > /tmp/${BUCKET}_policy.json <<POL
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::%BUCKET%/*"
    }
  ]
}
POL
sed -i "s/%BUCKET%/$BUCKET/g" /tmp/${BUCKET}_policy.json

POL_NAME="${BUCKET}-upload-policy"

# Create the policy (ignore if exists)
POL_ARN=$(aws iam create-policy --policy-name "$POL_NAME" --policy-document file:///tmp/${BUCKET}_policy.json --query 'Policy.Arn' --output text 2>/dev/null || true)
if [ -z "$POL_ARN" ]; then
  POL_ARN=$(aws iam list-policies --scope Local --query "Policies[?PolicyName=='$POL_NAME'].Arn" --output text)
fi

# Attach policy to user
aws iam attach-user-policy --user-name "${BUCKET}-uploader" --policy-arn "$POL_ARN" || true

# Create access key
CRED=$(aws iam create-access-key --user-name "${BUCKET}-uploader")
echo "=== Credentials (copy these to backend/.env) ==="
echo "$CRED"
echo ""
echo "Export these values to backend/.env:"
echo "AWS_ACCESS_KEY_ID=$(echo $CRED | jq -r '.AccessKey.AccessKeyId')"
echo "AWS_SECRET_ACCESS_KEY=$(echo $CRED | jq -r '.AccessKey.SecretAccessKey')"
echo "AWS_REGION=$REGION"
echo "AWS_BUCKET_NAME=$BUCKET"
echo ""
echo "Done."
