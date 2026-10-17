# Agent trials

These are manual task cases, not completed model evaluations. All cases currently
have status **not-run**. Structural tests and browser tests do not change that status.

Give a target small/local model only the repository URL and one request from
[cases.json](cases.json), with the ordinary file/command/browser tools available
in its host. Do not name the desired recipe in the prompt. Observe route discovery,
first useful output, verification, error recovery and follow-up preservation.

Record model identifier/settings, host/tool availability, date, exact core commit,
case ID, transcript, outputs/screenshots, pass/fail for each must/must_not, and
reviewer judgment. A route is not a pass unless the output actually exists and
works. Missing browser capability must be disclosed, not scored as visual review.
Use a stronger control model when diagnosing whether a failure comes from the
recipe or the model. Keep timing and subjective appearance separate from contracts.

Do not commit credentials, user project data or private transcripts. Store a small
sanitized evidence record before advertising success on a particular model.
