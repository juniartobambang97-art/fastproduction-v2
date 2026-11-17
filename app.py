from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000

BASE_DIR = Path(__file__).resolve().parent


class FastProductionHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def log_message(self, format, *args):
        print(f"[FP] {self.address_string()} - {format % args}")


def main():
    server = ThreadingHTTPServer((HOST, PORT), FastProductionHandler)

    print("=" * 45)
    print("       FASTPRODUCTION V2 - LOCAL SERVER")
    print("=" * 45)
    print(f"Directory : {BASE_DIR}")
    print(f"Local URL : http://localhost:{PORT}")
    print("Status    : RUNNING")
    print("Stop      : CTRL + C")
    print("=" * 45)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[FP] Server dihentikan.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
