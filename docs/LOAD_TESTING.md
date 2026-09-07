# Load Testing

## Rule

Do not load-test production without explicit owner authorization.

## CURRENT

No load-test suite is evident in the repository.

## TARGET FLOWS

- signup
- login/logout
- dashboard load
- profile save
- document upload
- report analysis
- Cesar message
- billing checkout/webhook simulation
- admin client list

## SCENARIOS

- 100 simulated users
- 500 simulated users
- 1,000 simulated users
- 5,000 simulated users after infrastructure review

## METRICS

- p50/p95 response time
- error rate
- database connection count
- slow queries
- CPU/memory
- external provider timeout rate
- queue depth after workers are introduced
