package guard

import (
	"net/http"
	"net/netip"
	"strings"
)

// RealIPHeader is the header that holds the address of the client.
//
// Traefik, the proxy in front of the API, removes the X-Forwarded-* headers and X-Real-Ip that a
// client sends, unless the entry point trusts the sender through forwardedHeaders.trustedIPs or
// forwardedHeaders.insecure. It then sets X-Real-Ip to the address that opened the connection.
// The entry points that Dokploy writes trust no sender, so a client cannot set this header. A
// request that reaches the API without Traefik can set it. Such a request can only move itself
// to another bucket of the limit of one address, and the total limit still holds.
const RealIPHeader = "X-Real-Ip"

// clientAddress returns the address in RealIPHeader. When the header is missing or does not hold
// an address, it returns the address of the connection.
func clientAddress(request *http.Request) netip.Addr {
	if address, err := netip.ParseAddr(strings.TrimSpace(request.Header.Get(RealIPHeader))); err == nil {
		return address
	}
	if addressPort, err := netip.ParseAddrPort(request.RemoteAddr); err == nil {
		return addressPort.Addr()
	}
	address, _ := netip.ParseAddr(request.RemoteAddr)
	return address
}

// ClientKey names the bucket of the client. An IPv4 address is its own bucket. An IPv6 address
// shares a bucket with its /64 network, because one host usually holds a whole /64 and could
// otherwise use a new address for each request. Requests with no address share one bucket.
func ClientKey(request *http.Request) string {
	address := clientAddress(request)
	if !address.IsValid() {
		return "unknown"
	}
	address = address.WithZone("").Unmap()
	if address.Is4() {
		return address.String()
	}
	network, _ := address.Prefix(64)
	return network.String()
}
