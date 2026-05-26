#!/bin/bash
set -e

echo "1. Send OTP..."
curl -s -X POST http://localhost:3000/api/v1/auth/otp/send -H "Content-Type: application/json" -d '{"phoneNumber": "+918888888888"}' > /dev/null

echo "Getting OTP from logs..."
sleep 2
OTP=$(docker logs vyaparnet-staging 2>&1 | grep "Sending OTP to +918888888888" | tail -n 1 | grep -oE '[0-9]{6}' | head -n 1)
echo "OTP is $OTP"

echo "2. Verify OTP..."
VERIFY_RES=$(curl -s -X POST http://localhost:3000/api/v1/auth/otp/verify -H "Content-Type: application/json" -d "{\"phoneNumber\": \"+918888888888\", \"otp\": \"$OTP\", \"deviceId\": \"123e4567-e89b-12d3-a456-426614174000\"}")
ACCESS_TOKEN=$(echo $VERIFY_RES | jq -r .data.accessToken)
REFRESH_TOKEN=$(echo $VERIFY_RES | jq -r .data.refreshToken)

echo "3. Get User Profile..."
curl -s -X GET http://localhost:3000/api/v1/users/me -H "Authorization: Bearer $ACCESS_TOKEN" | jq .success

echo "4. Refresh Token..."
REFRESH_RES=$(curl -s -X POST http://localhost:3000/api/v1/auth/refresh -H "Content-Type: application/json" -d "{\"refreshToken\": \"$REFRESH_TOKEN\"}")
NEW_ACCESS_TOKEN=$(echo $REFRESH_RES | jq -r .data.accessToken)
NEW_REFRESH_TOKEN=$(echo $REFRESH_RES | jq -r .data.refreshToken)
echo "Refresh success: $(echo $REFRESH_RES | jq .success)"

echo "5. Logout..."
curl -s -X POST http://localhost:3000/api/v1/auth/logout -H "Authorization: Bearer $NEW_ACCESS_TOKEN" -H "Content-Type: application/json" -d "{\"refreshToken\": \"$NEW_REFRESH_TOKEN\"}" | jq .success

