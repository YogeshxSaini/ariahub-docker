import os
import httpx


class Aria2Client:
    def __init__(self):
        self.rpc_url = os.getenv(
            "ARIA2_RPC_URL",
            "http://aria2:6800/jsonrpc",
        )

        self.secret = os.getenv(
            "ARIA2_RPC_SECRET",
            "",
        )

    async def call(self, method, params=None):
        params = list(params or [])

        if self.secret:
            params.insert(0, f"token:{self.secret}")

        payload = {
            "jsonrpc": "2.0",
            "id": "ariahub",
            "method": method,
            "params": params,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                self.rpc_url,
                json=payload,
            )

        response.raise_for_status()

        data = response.json()

        if "error" in data:
            raise RuntimeError(
                data["error"].get(
                    "message",
                    "aria2 RPC error",
                )
            )

        return data.get("result")

    async def add_url(self, url, options=None):
        params = [[url]]

        if options:
            params.append(options)

        return await self.call(
            "aria2.addUri",
            params,
        )

    async def get_status(self, gid):
        return await self.call(
            "aria2.tellStatus",
            [gid],
        )

    async def get_version(self):
        return await self.call(
            "aria2.getVersion"
        )

    async def pause(self, gid):
        return await self.call(
            "aria2.pause",
            [gid],
        )

    async def resume(self, gid):
        return await self.call(
            "aria2.unpause",
            [gid],
        )

    async def force_remove(self, gid):
        return await self.call(
            "aria2.forceRemove",
            [gid],
        )

    async def remove_result(self, gid):
        return await self.call(
            "aria2.removeDownloadResult",
            [gid],
        )
