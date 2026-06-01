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

## Cost guardrails

> ⚠️ **No `terraform apply` has been executed for this project. No paid AWS runtime resources exist.**

Target budget: **~30 EUR / month** (`monthly_budget_eur` default `30`).

Every billable resource is gated behind an **off-by-default** feature flag
(`infra/guardrails.tf`). Later phases must wrap their paid resources in
`count = var.enable_* ? 1 : 0`, so nothing costly is created without an
explicit opt-in.

| Flag | Default | Gates | Approx. cost in eu-central-1 |
|------|---------|-------|------------------------------|
| `enable_paid_resources` | `false` | master switch for all billable infra | — |
| `enable_nat_gateway` | `false` | NAT Gateway | **~32 EUR/mo** + data processing |
| `enable_alb` | `false` | Application Load Balancer | **~18–20 EUR/mo** + LCU |
| `enable_documentdb` | `false` *(locked)* | DocumentDB | out of scope — see below |

**Other (future) resource estimates, rough:**

| Resource | Approx. monthly cost |
|----------|----------------------|
| VPC / subnets / route tables / security groups | **0 EUR** |
| ECR (handful of images, lifecycle-trimmed) | **~0 EUR** (500 MB free tier) |
| RDS PostgreSQL `db.t3.micro`, Single-AZ, ~20 GB | **~15–18 EUR/mo** |
| ECS Fargate (0.25 vCPU / 0.5 GB, 1 task 24/7) | **~9 EUR/mo** per task |
| Secrets Manager | **~0.40 EUR/secret/mo** + API calls |

Figures are approximate and exclude data transfer; always confirm against a
fresh `terraform plan` and the AWS Pricing Calculator before enabling anything.

**`enable_documentdb` is locked to `false`** by a variable validation: MongoDB
is deferred for this budget, and if ever needed it will run externally on
MongoDB Atlas (never DocumentDB). Setting it `true` fails `terraform validate`.

### Tear-down (avoid surprise charges)

```bash
cd infra
terraform destroy            # removes everything this config manages
# verify nothing is left billing:
aws ec2 describe-nat-gateways      --query 'NatGateways[].NatGatewayId'
aws elbv2 describe-load-balancers   --query 'LoadBalancers[].LoadBalancerArn'
aws rds describe-db-instances       --query 'DBInstances[].DBInstanceIdentifier'
```

`force_delete = true` on the ECR repositories lets `destroy` succeed even when
images are present. Phase 1 resources are free, so destroying/recreating the
foundation costs nothing.

## RDS PostgreSQL (#44B)

`infra/rds.tf` defines an RDS PostgreSQL instance, **gated behind
`enable_paid_resources` (off by default)**. With the flag off, `terraform plan`
adds **no** RDS resources.

When enabled it is deliberately minimal and cheap:

| Setting | Value |
|---------|-------|
| Instance class | `db.t3.micro` (`db_instance_class`) |
| Storage | 20 GB gp3, encrypted (`db_allocated_storage`) |
| Availability | **Single-AZ** (`multi_az = false`) |
| Network | **private subnets only**, `publicly_accessible = false` |
| Access | only via the `*-db-sg` security group (app tier only) |
| Est. cost | **~15–18 EUR/mo** (instance + 20 GB) in eu-central-1 |

### Enabling it (only with explicit approval)

```bash
cd infra
# provide a password out-of-band — never commit it:
export TF_VAR_db_password='<a-strong-password>'
terraform plan  -var="enable_paid_resources=true"   # review the 2 new resources
terraform apply -var="enable_paid_resources=true"   # ONLY after approval
```

A `precondition` blocks enabling without a `db_password` of at least 8 chars.

### Tear-down

```bash
terraform destroy -var="enable_paid_resources=true"   # removes the DB instance + subnet group
# or simply set enable_paid_resources=false and apply to drop the paid resources
aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier'   # confirm none left
```

`skip_final_snapshot = true` and `deletion_protection = false` keep teardown
friction-free for this project. **No `terraform apply` has been run yet.**
