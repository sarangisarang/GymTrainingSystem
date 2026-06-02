terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Phase 1 uses local state (terraform.tfstate, gitignored).
  # A remote S3 + DynamoDB backend is intentionally deferred — it would
  # itself require infrastructure (chicken-and-egg) and is scoped to a
  # later phase once the foundation exists.
}
