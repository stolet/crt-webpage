# Tail-Contagion

Serve `webpage/` locally and open `/tail-contagion/index.html`. No build step.
Publishing remains a separate manual action.

One live microsecond clock drives every packet and visible metric. No background
workload, latency percentile estimate, or fixed network baseline is used.
Playback starts at 0.2 simulated µs per wall-clock second. Pause freezes the clock
and packet state; Step advances to the next processing action.

Packets travel the input conveyor for at least 0.65 µs, then traverse the intake
while a batch loads (0.4 µs). These are explicit simulated times. Batches contain
up to four packets. Per-packet costs depend on bytes and extra processing. The
bill posts after the complete batch, including setup. Budgets refill at the
configured interval and cannot accumulate beyond the configured cap.

Each packet has a 4 µs deadline from its arrival. The timer follows the same age
through queue, batch, processing, and output. Expiration records a single miss,
briefly shakes the packet, and permanently turns it amber with an exclamation
mark. Reduced-motion mode keeps the icon change and suppresses the shake.
Sender icons remain static.

Packet totals increment only when packets reach the bin. Output movement and
arrival use model events, including serialization when a batch completes several
packets together. The canvas counter and HTML readout read the same total on the
same draw. Victim missed deadlines are also exact event counts; only utilization
is eased visually. Utilization is cumulative busy time / reserved core time.

Run from the repository root:

```sh
node tests/tail-contagion.test.cjs
node tests/tail-contagion-ui.test.cjs
```

The timings illustrate datapath behavior; they are not hardware measurements.
