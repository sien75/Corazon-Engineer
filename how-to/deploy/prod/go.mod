module engineer/launcher

go 1.25.0

// The launcher is a multi-call binary: it is also the process that runs the
// three Go services, so it has to link them in. Pointing at the local modules is
// what makes that a single `go build` with no workspace file.
require (
	engineer/log v0.0.0
	engineer/static v0.0.0
	engineer/web v0.0.0
)

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/sys v0.47.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
	modernc.org/libc v1.74.4 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
	modernc.org/sqlite v1.57.0 // indirect
)

replace (
	engineer/log => ../../../workspace/log
	engineer/static => ../../../workspace/static
	engineer/web => ../../../workspace/web/server
)
