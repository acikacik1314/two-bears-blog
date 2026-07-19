"""
Shared utilities for prophet-related scripts.

All scripts that filter by prophet should use matches_prophet() instead of
a direct == comparison, to correctly handle both string and list formats.
"""


def matches_prophet(data: dict, name: str) -> bool:
    """Return True if the frontmatter dict is attributed to this prophet."""
    p = data.get('prophet')
    if isinstance(p, str):
        return p == name
    if isinstance(p, list):
        return name in p
    return False


def get_predictions(data: dict, prophet_id: str | None = None) -> dict:
    """
    Return {hits, misses, pending, excluded} for a given prophet.

    Handles both formats:
      Format A (flat):        predictions: {hits: [...], ...}
      Format B (per-prophet): predictions: {比格斯: {hits: [...]}, 帕克: {...}}

    If prophet_id is None, returns the flat predictions (Format A only).
    """
    preds = data.get('predictions') or {}
    if not isinstance(preds, dict):
        return {'hits': [], 'misses': [], 'pending': [], 'excluded': []}

    if prophet_id and prophet_id in preds:
        entry = preds[prophet_id]
        if isinstance(entry, dict):
            return {
                'hits':     entry.get('hits', []) or [],
                'misses':   entry.get('misses', []) or [],
                'pending':  entry.get('pending', []) or [],
                'excluded': entry.get('excluded', []) or [],
            }

    # Format A or fallback
    if 'hits' in preds or 'misses' in preds or 'pending' in preds:
        return {
            'hits':     preds.get('hits', []) or [],
            'misses':   preds.get('misses', []) or [],
            'pending':  preds.get('pending', []) or [],
            'excluded': preds.get('excluded', []) or [],
        }

    return {'hits': [], 'misses': [], 'pending': [], 'excluded': []}
