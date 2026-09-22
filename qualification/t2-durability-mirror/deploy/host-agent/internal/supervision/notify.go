package supervision

import (
	"net"
	"os"
	"strings"
	"time"
)

func Notify(message string) error {
	path := os.Getenv("NOTIFY_SOCKET")
	if path == "" {
		return nil
	}
	if strings.HasPrefix(path, "@") {
		path = "\x00" + path[1:]
	}
	addr := &net.UnixAddr{Name: path, Net: "unixgram"}
	conn, err := net.DialUnix("unixgram", nil, addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	_, err = conn.Write([]byte(message))
	return err
}

func WatchdogInterval() time.Duration {
	v := os.Getenv("WATCHDOG_USEC")
	if v == "" {
		return 0
	}
	usec, err := time.ParseDuration(v + "us")
	if err != nil || usec <= 0 {
		return 0
	}
	return usec / 2
}
