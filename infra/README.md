# Infrastructure (Terraform) — #44

AWS Infrastructure as Code for GymTrainingSystem, built in small phases.

## Phase 1 — Foundation (this PR)

Free, low-risk networking + registry foundation. **No compute, no database, no
load balancer, no NAT Gateway** — so it costs effectively **$0**.

| Resource | Count | Notes |
|----------|-------|-------|
| VPC | 1 | `10.0.0.0/16`, DNS enabled |
| Internet Gateway | 1 | public egress |
| Public subnets | 2 | one per AZ, `map_public_ip_on_launch` |
| Private subnets | 2 | one per AZ, no NAT route yet |
| Route tables (+ associations) | 2 (+4) | public → IGW, private → local-only |
| Security groups | 3 | `alb` (80/443 ⇽ internet) → `app` (3000/8000 ⇽ alb) → `db` (5432 ⇽ app) |
| ECR repositories | 2 | `gymtracker-backend`, `gymtracker-frontend`, scan-on-push + lifecycle policy |

`terraform plan` → **19 to add, 0 to change, 0 to destroy.**

### Deliberately deferred
- **NAT Gateway** (~$32/mo) — only needed when private ECS tasks need outbound internet → Phase 2.
- **ECS Fargate, ALB, RDS PostgreSQL, Secrets Manager** → Phase 2 (`#44`).
- **Remote S3 + DynamoDB state backend** — would itself need infra (chicken-and-egg); Phase 1 uses **local state** (gitignored).

## Prerequisites
- Terraform `>= 1.5`
- AWS credentials with permission to manage VPC/EC2/ECR (e.g. `~/.aws/credentials`)
- Region: `eu-central-1` (override via `-var="aws_region=..."`)

## Usage

```bash
cd infra

terraform init          # downloads the AWS provider, creates local state
terraform fmt -check    # formatting
terraform validate      # static validation
terraform plan          # preview (read-only against AWS) — review before applying
# terraform apply       # create the foundation (run manually after review)
# terraform destroy      # tear it all down (force_delete on ECR allows this)
```

State (`terraform.tfstate`) is local and **gitignored** — do not commit it.
The provider lock file (`.terraform.lock.hcl`) **is** committed for reproducible plans.
