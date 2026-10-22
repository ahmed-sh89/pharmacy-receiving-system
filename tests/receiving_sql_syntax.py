"""Parse review drafts without opening a database or executing any SQL.
Requires pglast (used only as a PostgreSQL/PLpgSQL parser).
"""
from pathlib import Path
from pglast import parse_sql, parse_plpgsql
root = Path(__file__).resolve().parents[1] / 'sql' / 'receiving-hotfix-review'
for path in sorted(root.glob('*.sql')):
    source = path.read_text()
    statements = parse_sql(source)
    parse_plpgsql(source)
    allowed = {'TransactionStmt', 'VariableSetStmt', 'CreateFunctionStmt', 'AlterTableStmt', 'GrantStmt', 'CreateSeqStmt', 'CreateStmt', 'AlterSeqStmt', 'IndexStmt', 'DoStmt'}
    unexpected = [type(row.stmt).__name__ for row in statements if type(row.stmt).__name__ not in allowed]
    assert not unexpected, (path.name, unexpected)
    print(f'{path.name}: SQL + PL/pgSQL parse PASS; {len(statements)} statements; no execution')
