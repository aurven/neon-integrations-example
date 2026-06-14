#!/bin/bash
#=============================================================================
# poll_test.sh - Enhanced Multi-Endpoint Polling Script v2.0
#
# DESCRIPTION:
#   Polls one or more HTTP endpoints at configurable intervals.
#   Supports both single-endpoint CLI mode and multi-endpoint config mode.
#
# USAGE:
#   Single endpoint:  ./poll_test.sh -k API_KEY [-h HOST] [-p PORT]
#   Multi-endpoint:   ./poll_test.sh -c poll-config.json [-i INTERVAL] [-P]
#
# REQUIREMENTS:
#   - jq (for JSON config parsing in multi-endpoint mode)
#   - curl (for HTTP requests)
#
# EXIT CODES:
#   0 - Normal exit (Ctrl+C or SIGTERM)
#   1 - Configuration error
#   2 - Missing required arguments
#   3 - Missing dependency (jq)
#=============================================================================

#=============================================================================
# SECTION 1: CONSTANTS AND DEFAULTS
#=============================================================================
readonly VERSION="2.0.0"
readonly DEFAULT_PORT=3000
readonly DEFAULT_HOST="localhost"
readonly DEFAULT_INTERVAL=300
readonly DEFAULT_TIMEOUT=30
readonly DEFAULT_OUTPUT="table"

# Colors (will be disabled with --no-color)
COLOR_RESET="\033[0m"
COLOR_GREEN="\033[32m"
COLOR_RED="\033[31m"
COLOR_YELLOW="\033[33m"
COLOR_BLUE="\033[34m"
COLOR_BOLD="\033[1m"

# Global state
declare -a BACKGROUND_PIDS=()
OUTPUT_FIFO=""
LOG_FILE=""
NO_COLOR=0

#=============================================================================
# SECTION 2: UTILITY FUNCTIONS
#=============================================================================
log_info() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    if [[ $NO_COLOR -eq 1 ]]; then
        echo "[$timestamp] INFO: $1"
    else
        echo -e "[$timestamp] ${COLOR_BLUE}INFO:${COLOR_RESET} $1"
    fi
    [[ -n "$LOG_FILE" ]] && echo "[$timestamp] INFO: $1" >> "$LOG_FILE"
}

log_error() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    if [[ $NO_COLOR -eq 1 ]]; then
        echo "[$timestamp] ERROR: $1" >&2
    else
        echo -e "[$timestamp] ${COLOR_RED}ERROR:${COLOR_RESET} $1" >&2
    fi
    [[ -n "$LOG_FILE" ]] && echo "[$timestamp] ERROR: $1" >> "$LOG_FILE"
}

log_success() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    if [[ $NO_COLOR -eq 1 ]]; then
        echo "[$timestamp] SUCCESS: $1"
    else
        echo -e "[$timestamp] ${COLOR_GREEN}SUCCESS:${COLOR_RESET} $1"
    fi
    [[ -n "$LOG_FILE" ]] && echo "[$timestamp] SUCCESS: $1" >> "$LOG_FILE"
}

print_separator() {
    echo "================================================================================"
}

print_header() {
    local started=$(date '+%Y-%m-%d %H:%M:%S')
    local endpoint_count="$1"
    local interval="$2"

    print_separator
    if [[ $NO_COLOR -eq 1 ]]; then
        echo "POLL MONITOR v$VERSION - Started: $started | Endpoints: $endpoint_count | Interval: ${interval}s"
    else
        echo -e "${COLOR_BOLD}POLL MONITOR v$VERSION${COLOR_RESET} - Started: $started | Endpoints: $endpoint_count | Interval: ${interval}s"
    fi
    print_separator
    echo ""
}

#=============================================================================
# SECTION 3: DEPENDENCY AND VALIDATION FUNCTIONS
#=============================================================================
check_jq_installed() {
    if ! command -v jq &> /dev/null; then
        log_error "jq is required for config file mode but is not installed."
        echo ""
        echo "Install jq using one of the following:"
        echo "  macOS:   brew install jq"
        echo "  Ubuntu:  sudo apt-get install jq"
        echo "  CentOS:  sudo yum install jq"
        exit 3
    fi
}

validate_config_file() {
    local config_file="$1"

    if [[ ! -f "$config_file" ]]; then
        log_error "Config file not found: $config_file"
        exit 1
    fi

    if ! jq empty "$config_file" 2>/dev/null; then
        log_error "Invalid JSON in config file: $config_file"
        exit 1
    fi

    local endpoint_count=$(jq '.endpoints | length' "$config_file")
    if [[ "$endpoint_count" -eq 0 ]]; then
        log_error "No endpoints defined in config file"
        exit 1
    fi
}

#=============================================================================
# SECTION 4: JSON PARSING AND ENVIRONMENT EXPANSION
#=============================================================================
expand_env_vars() {
    local input="$1"
    # Replace ${VAR_NAME} with actual environment variable values
    while [[ "$input" =~ \$\{([A-Za-z_][A-Za-z0-9_]*)\} ]]; do
        local var_name="${BASH_REMATCH[1]}"
        local var_value="${!var_name}"
        input="${input/\$\{$var_name\}/$var_value}"
    done
    echo "$input"
}

get_config_default() {
    local config_file="$1"
    local field="$2"
    local fallback="$3"

    local value=$(jq -r ".defaults.$field // \"$fallback\"" "$config_file")
    echo "$value"
}

get_endpoint_field() {
    local endpoint_json="$1"
    local field="$2"
    local fallback="$3"

    local value=$(echo "$endpoint_json" | jq -r ".$field // \"$fallback\"")
    echo "$value"
}

get_enabled_endpoints() {
    local config_file="$1"
    jq -c '.endpoints[] | select(.enabled != false)' "$config_file"
}

build_endpoint_url() {
    local endpoint_json="$1"

    # Check if full URL is provided
    local url=$(echo "$endpoint_json" | jq -r '.url // ""')
    if [[ -n "$url" && "$url" != "null" ]]; then
        echo "$url"
        return
    fi

    # Build from components
    local host=$(echo "$endpoint_json" | jq -r '.host // "localhost"')
    local port=$(echo "$endpoint_json" | jq -r '.port // ""')
    local path=$(echo "$endpoint_json" | jq -r '.path // "/test"')

    # Determine protocol
    local protocol="http"
    if [[ "$port" == "443" ]] || [[ "$host" =~ ^https?:// ]]; then
        protocol="https"
    fi

    # Handle host with protocol already included
    if [[ "$host" =~ ^https?:// ]]; then
        if [[ -n "$port" && "$port" != "null" ]]; then
            echo "${host}:${port}${path}"
        else
            echo "${host}${path}"
        fi
        return
    fi

    # Build URL
    if [[ -n "$port" && "$port" != "null" ]]; then
        echo "${protocol}://${host}:${port}${path}"
    else
        echo "${protocol}://${host}${path}"
    fi
}

#=============================================================================
# SECTION 5: POLLING FUNCTIONS
#=============================================================================
poll_single_endpoint() {
    local name="$1"
    local url="$2"
    local apikey="$3"
    local timeout="$4"

    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Get start time in milliseconds (works on both macOS and Linux)
    local start_time
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS: use perl for millisecond precision
        start_time=$(perl -MTime::HiRes=time -e 'printf "%.0f", time * 1000')
    else
        # Linux: use date with nanoseconds
        start_time=$(date +%s%3N)
    fi

    # Make the HTTP request
    local response=$(curl -s -w "\n%{http_code}" \
        --connect-timeout "$timeout" \
        -H "ApiKey: $apikey" \
        "$url" 2>/dev/null)

    local curl_exit=$?

    # Get end time in milliseconds
    local end_time
    if [[ "$(uname)" == "Darwin" ]]; then
        end_time=$(perl -MTime::HiRes=time -e 'printf "%.0f", time * 1000')
    else
        end_time=$(date +%s%3N)
    fi
    local response_time=$((end_time - start_time))

    if [[ $curl_exit -eq 0 ]]; then
        # Split response body and HTTP code
        local http_code=$(echo "$response" | tail -n1)
        local body=$(echo "$response" | sed '$d')

        if [[ "$http_code" == "200" ]]; then
            # Parse JSON response
            local message=$(echo "$body" | jq -r '.message // ""' 2>/dev/null || echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
            local version=$(echo "$body" | jq -r '.version // ""' 2>/dev/null || echo "$body" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
            local location=$(echo "$body" | jq -r '.location // ""' 2>/dev/null || echo "$body" | grep -o '"location":"[^"]*"' | cut -d'"' -f4)

            echo "SUCCESS|$http_code|$response_time|$message|$version|$location"
        else
            echo "ERROR|$http_code|$response_time|HTTP $http_code: $body||"
        fi
    else
        echo "ERROR|0|$response_time|Failed to connect to $url||"
    fi
}

format_poll_result() {
    local name="$1"
    local result="$2"
    local output_format="$3"

    IFS='|' read -r status http_code response_time message version location <<< "$result"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    case "$output_format" in
        json)
            cat <<EOF
{"timestamp":"$timestamp","endpoint":"$name","status":"${status,,}","http_code":$http_code,"response_time_ms":$response_time,"message":"$message","version":"$version","location":"$location"}
EOF
            ;;
        csv)
            echo "$timestamp,$name,${status,,},$http_code,$response_time,$message,$version,$location"
            ;;
        table|*)
            if [[ "$status" == "SUCCESS" ]]; then
                if [[ $NO_COLOR -eq 1 ]]; then
                    echo "[$timestamp] $name"
                    echo "  Status: SUCCESS ($http_code) | Message: $message | Version: $version | Location: $location"
                else
                    echo -e "[$timestamp] ${COLOR_BOLD}$name${COLOR_RESET}"
                    echo -e "  Status: ${COLOR_GREEN}SUCCESS${COLOR_RESET} ($http_code) | Message: $message | Version: $version | Location: $location"
                fi
            else
                if [[ $NO_COLOR -eq 1 ]]; then
                    echo "[$timestamp] $name"
                    echo "  Status: ERROR ($http_code) | $message"
                else
                    echo -e "[$timestamp] ${COLOR_BOLD}$name${COLOR_RESET}"
                    echo -e "  Status: ${COLOR_RED}ERROR${COLOR_RESET} ($http_code) | $message"
                fi
            fi
            echo ""
            ;;
    esac
}

poll_all_sequential() {
    local config_file="$1"
    local interval_override="$2"
    local output_format="$3"

    local default_interval=$(get_config_default "$config_file" "interval" "$DEFAULT_INTERVAL")
    local default_timeout=$(get_config_default "$config_file" "timeout" "$DEFAULT_TIMEOUT")
    local interval="${interval_override:-$default_interval}"

    # Count enabled endpoints
    local endpoint_count=$(jq '[.endpoints[] | select(.enabled != false)] | length' "$config_file")

    # Print header
    print_header "$endpoint_count" "$interval"

    if [[ "$output_format" == "csv" ]]; then
        echo "timestamp,endpoint,status,http_code,response_time_ms,message,version,location"
    fi

    while true; do
        while IFS= read -r endpoint_json; do
            local name=$(get_endpoint_field "$endpoint_json" "name" "unnamed")
            local url=$(build_endpoint_url "$endpoint_json")
            local apikey_raw=$(get_endpoint_field "$endpoint_json" "apikey" "")
            local apikey=$(expand_env_vars "$apikey_raw")
            local timeout=$(get_endpoint_field "$endpoint_json" "timeout" "$default_timeout")

            local result=$(poll_single_endpoint "$name" "$url" "$apikey" "$timeout")
            format_poll_result "$name" "$result" "$output_format"

        done < <(get_enabled_endpoints "$config_file")

        if [[ "$output_format" == "table" ]]; then
            echo "--- Next poll in $interval seconds ---"
            echo ""
        fi

        sleep "$interval"
    done
}

poll_all_parallel() {
    local config_file="$1"
    local interval_override="$2"
    local output_format="$3"

    local default_interval=$(get_config_default "$config_file" "interval" "$DEFAULT_INTERVAL")
    local default_timeout=$(get_config_default "$config_file" "timeout" "$DEFAULT_TIMEOUT")
    local global_interval="${interval_override:-$default_interval}"

    # Count enabled endpoints
    local endpoint_count=$(jq '[.endpoints[] | select(.enabled != false)] | length' "$config_file")

    # Print header
    print_header "$endpoint_count" "$global_interval (parallel)"

    if [[ "$output_format" == "csv" ]]; then
        echo "timestamp,endpoint,status,http_code,response_time_ms,message,version,location"
    fi

    # Create output fifo for serialization
    OUTPUT_FIFO=$(mktemp -u)
    mkfifo "$OUTPUT_FIFO"

    # Background reader that serializes output
    (
        while IFS= read -r line; do
            echo "$line"
            [[ -n "$LOG_FILE" ]] && echo "$line" >> "$LOG_FILE"
        done < "$OUTPUT_FIFO"
    ) &
    local reader_pid=$!
    BACKGROUND_PIDS+=($reader_pid)

    # Start a polling loop for each endpoint
    while IFS= read -r endpoint_json; do
        (
            local name=$(get_endpoint_field "$endpoint_json" "name" "unnamed")
            local url=$(build_endpoint_url "$endpoint_json")
            local apikey_raw=$(get_endpoint_field "$endpoint_json" "apikey" "")
            local apikey=$(expand_env_vars "$apikey_raw")
            local timeout=$(get_endpoint_field "$endpoint_json" "timeout" "$default_timeout")
            local endpoint_interval=$(get_endpoint_field "$endpoint_json" "interval" "$global_interval")

            # Use override if provided
            [[ -n "$interval_override" ]] && endpoint_interval="$interval_override"

            while true; do
                local result=$(poll_single_endpoint "$name" "$url" "$apikey" "$timeout")
                format_poll_result "$name" "$result" "$output_format" > "$OUTPUT_FIFO"
                sleep "$endpoint_interval"
            done
        ) &
        BACKGROUND_PIDS+=($!)
    done < <(get_enabled_endpoints "$config_file")

    # Wait for signal
    wait
}

# Legacy single-endpoint polling (backward compatible)
poll_single_legacy() {
    local url="$1"
    local apikey="$2"
    local interval="$3"

    echo "Starting polling service..."
    echo "URL: $url"
    echo "API Key: ${apikey:0:8}***"
    echo "Poll interval: $interval seconds"
    echo "Press Ctrl+C to stop"
    echo ""

    while true; do
        local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

        # Make the HTTP request
        local response=$(curl -s -w "\n%{http_code}" -H "ApiKey: $apikey" "$url" 2>/dev/null)

        if [[ $? -eq 0 ]]; then
            # Split response body and HTTP code
            local http_code=$(echo "$response" | tail -n1)
            local body=$(echo "$response" | sed '$d')

            if [[ "$http_code" == "200" ]]; then
                # Parse JSON response
                local message=$(echo "$body" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)
                local version=$(echo "$body" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
                local location=$(echo "$body" | grep -o '"location":"[^"]*"' | cut -d'"' -f4)

                echo "[$timestamp] SUCCESS - Message: $message, Version: $version, Location: $location"
            else
                echo "[$timestamp] ERROR - HTTP $http_code: $body"
            fi
        else
            echo "[$timestamp] ERROR - Failed to connect to $url"
        fi

        sleep "$interval"
    done
}

#=============================================================================
# SECTION 6: SIGNAL HANDLERS AND CLEANUP
#=============================================================================
cleanup() {
    echo ""
    echo "Stopping polling service..."

    # Clean up background PIDs
    for pid in "${BACKGROUND_PIDS[@]}"; do
        kill "$pid" 2>/dev/null
    done

    # Clean up fifo
    [[ -n "$OUTPUT_FIFO" && -p "$OUTPUT_FIFO" ]] && rm -f "$OUTPUT_FIFO"

    exit 0
}

trap cleanup SIGINT SIGTERM

#=============================================================================
# SECTION 7: USAGE AND CLI PARSING
#=============================================================================
usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Enhanced Multi-Endpoint Polling Script v$VERSION

Configuration Options:
  -c, --config FILE      JSON configuration file for multi-endpoint polling
  -i, --interval SECS    Polling interval in seconds (default: $DEFAULT_INTERVAL)
  -t, --timeout SECS     Request timeout in seconds (default: $DEFAULT_TIMEOUT)

Single Endpoint Options (legacy mode):
  -u, --url URL          Full URL to poll (e.g., https://example.com/test)
  -h, --host HOST        Host to poll (default: $DEFAULT_HOST)
  -p, --port PORT        Port to poll (default: $DEFAULT_PORT)
  -k, --apikey KEY       API key for authentication (required for single mode)

Execution Options:
  -P, --parallel         Run endpoint polls in parallel (default: sequential)
  -o, --output FORMAT    Output format: table, json, csv (default: $DEFAULT_OUTPUT)
  -l, --log FILE         Log output to file in addition to stdout
  --dry-run              Validate config and show what would be polled
  --no-color             Disable colored output
  --help                 Show this help message
  --version              Show version information

Examples:
  # Legacy single endpoint mode
  $0 -k your_api_key -p 8080

  # Multi-endpoint with config file
  $0 -c poll-config.json

  # Config file with interval override and parallel execution
  $0 -c poll-config.json -i 60 -P

  # Config file with JSON output to log file
  $0 -c poll-config.json -o json -l results.log

  # Validate config without polling
  $0 -c poll-config.json --dry-run
EOF
    exit 1
}

show_version() {
    echo "poll_test.sh version $VERSION"
    exit 0
}

dry_run() {
    local config_file="$1"

    echo "Dry run - validating configuration..."
    echo ""

    validate_config_file "$config_file"

    local default_interval=$(get_config_default "$config_file" "interval" "$DEFAULT_INTERVAL")
    local default_timeout=$(get_config_default "$config_file" "timeout" "$DEFAULT_TIMEOUT")

    echo "Configuration valid!"
    echo ""
    echo "Defaults:"
    echo "  Interval: ${default_interval}s"
    echo "  Timeout: ${default_timeout}s"
    echo ""
    echo "Endpoints to poll:"

    local count=0
    while IFS= read -r endpoint_json; do
        local name=$(get_endpoint_field "$endpoint_json" "name" "unnamed")
        local url=$(build_endpoint_url "$endpoint_json")
        local apikey_raw=$(get_endpoint_field "$endpoint_json" "apikey" "")
        local apikey=$(expand_env_vars "$apikey_raw")
        local endpoint_interval=$(get_endpoint_field "$endpoint_json" "interval" "$default_interval")

        ((count++))
        echo ""
        echo "  $count. $name"
        echo "     URL: $url"
        echo "     API Key: ${apikey:0:8}***"
        echo "     Interval: ${endpoint_interval}s"
    done < <(get_enabled_endpoints "$config_file")

    local disabled_count=$(jq '[.endpoints[] | select(.enabled == false)] | length' "$config_file")
    if [[ "$disabled_count" -gt 0 ]]; then
        echo ""
        echo "Disabled endpoints: $disabled_count"
    fi

    echo ""
    echo "Ready to poll $count endpoint(s)"
    exit 0
}

#=============================================================================
# SECTION 8: MAIN EXECUTION
#=============================================================================
main() {
    # Parse command line arguments
    local config_file=""
    local interval_override=""
    local timeout_override=""
    local full_url=""
    local host=""
    local port=""
    local apikey=""
    local parallel_mode=0
    local output_format="$DEFAULT_OUTPUT"
    local do_dry_run=0

    while [[ $# -gt 0 ]]; do
        case $1 in
            -c|--config)
                config_file="$2"
                shift 2
                ;;
            -i|--interval)
                interval_override="$2"
                shift 2
                ;;
            -t|--timeout)
                timeout_override="$2"
                shift 2
                ;;
            -u|--url)
                full_url="$2"
                shift 2
                ;;
            -h|--host)
                host="$2"
                shift 2
                ;;
            -p|--port)
                port="$2"
                shift 2
                ;;
            -k|--apikey)
                apikey="$2"
                shift 2
                ;;
            -P|--parallel)
                parallel_mode=1
                shift
                ;;
            -o|--output)
                output_format="$2"
                shift 2
                ;;
            -l|--log)
                LOG_FILE="$2"
                shift 2
                ;;
            --dry-run)
                do_dry_run=1
                shift
                ;;
            --no-color)
                NO_COLOR=1
                COLOR_RESET=""
                COLOR_GREEN=""
                COLOR_RED=""
                COLOR_YELLOW=""
                COLOR_BLUE=""
                COLOR_BOLD=""
                shift
                ;;
            --help)
                usage
                ;;
            --version)
                show_version
                ;;
            *)
                echo "Unknown option: $1"
                usage
                ;;
        esac
    done

    # Determine mode and execute
    if [[ -n "$config_file" ]]; then
        # Config file mode
        check_jq_installed
        validate_config_file "$config_file"

        if [[ $do_dry_run -eq 1 ]]; then
            dry_run "$config_file"
        elif [[ $parallel_mode -eq 1 ]]; then
            poll_all_parallel "$config_file" "$interval_override" "$output_format"
        else
            poll_all_sequential "$config_file" "$interval_override" "$output_format"
        fi
    elif [[ -n "$apikey" ]] || [[ -n "$full_url" ]] || [[ -n "$host" ]]; then
        # Legacy single endpoint mode
        if [[ -z "$apikey" ]]; then
            log_error "API key is required. Use -k or --apikey option."
            usage
        fi

        # Determine URL
        local url=""
        if [[ -n "$full_url" ]]; then
            url="$full_url"
        else
            host="${host:-$DEFAULT_HOST}"

            if [[ "$host" =~ ^https?:// ]]; then
                url="${host}/test"
            elif [[ -n "$host" && "$host" != "$DEFAULT_HOST" && -z "$port" ]]; then
                url="https://${host}/test"
            else
                port="${port:-$DEFAULT_PORT}"
                local protocol="http"
                [[ "$port" == "443" ]] && protocol="https"
                url="${protocol}://${host}:${port}/test"
            fi
        fi

        local interval="${interval_override:-$DEFAULT_INTERVAL}"
        poll_single_legacy "$url" "$apikey" "$interval"
    else
        log_error "Either -c/--config or -k/--apikey is required."
        usage
    fi
}

main "$@"
