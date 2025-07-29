#!/bin/bash

# Default configuration
DEFAULT_PORT=3000
DEFAULT_HOST="localhost"
POLL_INTERVAL=300  # 5 minutes in seconds

# Function to display usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -u, --url URL        Full URL to poll (e.g., https://example.com/test)"
    echo "  -h, --host HOST      Host to poll (default: $DEFAULT_HOST)"
    echo "  -p, --port PORT      Port to poll (default: $DEFAULT_PORT)"
    echo "  -k, --apikey KEY     API key for authentication (required)"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -k your_api_key                                    # Poll localhost:3000/test"
    echo "  $0 -k your_api_key -p 8080                           # Poll localhost:8080/test"
    echo "  $0 -k your_api_key -h example.com -p 443             # Poll example.com:443/test"
    echo "  $0 -k your_api_key -u https://example.com/test       # Poll full URL"
    exit 1
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            FULL_URL="$2"
            shift 2
            ;;
        -h|--host)
            HOST="$2"
            shift 2
            ;;
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -k|--apikey)
            API_KEY="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Check if API key is provided
if [[ -z "$API_KEY" ]]; then
    echo "Error: API key is required. Use -k or --apikey option."
    usage
fi

# Determine the URL to poll
if [[ -n "$FULL_URL" ]]; then
    URL="$FULL_URL"
else
    HOST="${HOST:-$DEFAULT_HOST}"
    
    # Check if host already contains protocol
    if [[ "$HOST" =~ ^https?:// ]]; then
        # Host already has protocol, use it as-is
        URL="${HOST}/test"
    elif [[ -n "$HOST" && "$HOST" != "$DEFAULT_HOST" && -z "$PORT" ]]; then
        # If host is specified and no port is provided, don't add default port
        # Determine protocol for external hosts (default to https)
        PROTOCOL="https"
        URL="${PROTOCOL}://${HOST}/test"
    else
        # Use default port for localhost or when port is explicitly provided
        PORT="${PORT:-$DEFAULT_PORT}"
        
        # Determine protocol based on port
        if [[ "$PORT" == "443" ]]; then
            PROTOCOL="https"
        else
            PROTOCOL="http"
        fi
        
        URL="${PROTOCOL}://${HOST}:${PORT}/test"
    fi
fi

echo "Starting polling service..."
echo "URL: $URL"
echo "API Key: ${API_KEY:0:8}***"
echo "Poll interval: $POLL_INTERVAL seconds (5 minutes)"
echo "Press Ctrl+C to stop"
echo ""

# Function to handle graceful shutdown
cleanup() {
    echo ""
    echo "Stopping polling service..."
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Main polling loop
while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    
    # Make the HTTP request
    RESPONSE=$(curl -s -w "\n%{http_code}" -H "ApiKey: $API_KEY" "$URL" 2>/dev/null)
    
    if [[ $? -eq 0 ]]; then
        # Split response body and HTTP code
        HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
        BODY=$(echo "$RESPONSE" | sed '$d')
        
        if [[ "$HTTP_CODE" == "200" ]]; then
            # Parse JSON response
            MESSAGE=$(echo "$BODY" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
            VERSION=$(echo "$BODY" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            LOCATION=$(echo "$BODY" | grep -o '"location":"[^"]*"' | cut -d'"' -f4)
            
            echo "[$TIMESTAMP] SUCCESS - Message: $MESSAGE, Version: $VERSION, Location: $LOCATION"
        else
            echo "[$TIMESTAMP] ERROR - HTTP $HTTP_CODE: $BODY"
        fi
    else
        echo "[$TIMESTAMP] ERROR - Failed to connect to $URL"
    fi
    
    # Wait for the specified interval
    sleep $POLL_INTERVAL
done