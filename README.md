# slotmutoscope

The parlor is nickelodeon-dark; walnut and brass take the weight of an arcade cabinet.
You lean into a velvet hood — a circular peephole, a stack of stiff picture cards, a hand crank.
Each confirmed slot snaps the next card into the hole: a discrete flip, never a spinning drum.
Fee heat reddens the crank and flares the coal-oil lamp; failed txs tear, dog-ear, or jam a beat.
Close the shutter and the strip freezes. This is a peep-show instrument, not a product.

Live Solana **mainnet** as a Victorian mutoscope. Not an explorer. Not a dashboard. Not a newspaper.
Distinct from slotzoetrope (slit drum), slotkaleidoscope (mirrored shards), slotbeacon (lighthouse),
slotneon (shop tubes), sandslot (hourglass), and solflap (split-flap board).

Live: https://robertkodes.github.io/slotmutoscope/

## How to read the peephole

| Cabinet | Chain |
| --- | --- |
| Card snap / crank tick | Confirmed slot clock |
| Flip card in the hole | A recent transaction |
| Border / costume tint | Program family: system, JUP, RAY, token, stake, unknown |
| Crank heat / motion smear / lamp flare | `getRecentPrioritizationFees` pressure, log-scaled |
| Torn, dog-eared, or jammed card + blank flash | Sampled signature with `err` — lingers a beat longer |
| **SHUTTER** / Space | Freeze the current strip |
| OPEN / Space again | Resume the live reel |

No wallet. No keys. Browser talks JSON-RPC.

## Palette

Named hex, nickelodeon wood and lamp, six dyes:

| Token | Hex | Use |
| --- | --- | --- |
| **soot** | `#1A1008` | Parlor void, velvet hood |
| **walnut** | `#4A2C18` | Cabinet wood, grain |
| **brass** | `#C4A46A` | Crank, bezel, JUP cards |
| **lamp** | `#F0C46A` | Coal-oil glow, system cards, live digits |
| **sepia** | `#D4B896` | Card stock, token cards, labels |
| **vermilion** | `#A83828` | Torn / jammed cards, closed shutter |

RAY ember (`#8C4030`) is vermilion mixed toward walnut. Stake dim (`#8A6E42`) is brass into soot. Unknown ash (`#6A5848`) is sepia dimmed into soot. None is a seventh brand color.

## Type

- **Yeseva One** — nickelodeon poster mast. Theatrical display serif, not Inter, not a SaaS geometric.
- **Courier Prime** — ticket figures, the shutter lever. Reads as a stub stamp, not a terminal theme.

## Tinkerer notes

```bash
npm i
npm run dev
```

Vite serves at `/slotmutoscope/`. Open that path, not `/`.

```bash
npm run build
```

must pass. Static `dist/` is force-pushed to the `gh-pages` branch at root (`index.html`, `assets/`, `.nojekyll`). Repo Pages source should be **branch `gh-pages` / folder `/`**. Enabling Pages via API may return **403** (token cannot write Pages settings). One click: GitHub → Settings → Pages → source **`gh-pages` / root**.

Public RPC, rotating on failure (no API keys):

- `solana-rpc.publicnode.com`
- `solana.publicnode.com`
- `solana-mainnet.publicnode.com`
- `api.mainnet-beta.solana.com`
- `solana.drpc.org`

Override with `VITE_RPC_URL`. Methods: `getSlot`, `getRecentPerformanceSamples`, `getRecentPrioritizationFees`, rotating `getSignaturesForAddress` on a short program roster via `@solana/web3.js`. If RPC flakes, the cabinet keeps the last cards and the ticket marks **degraded**.

`prefers-reduced-motion`: static card in the hole (no flip, no crank smear, no lamp flicker); slot / TPS / RTT still update until you close the shutter.

Space or the shutter lever freezes the strip.
