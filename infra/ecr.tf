# ─────────────────────────────────────────────────────────────────────────
# ECR repositories for the backend and frontend images that CI will push
# (Phase 2, #43 deploy half). Storage for a handful of images is effectively
# free; a lifecycle policy expires untagged images so the repos stay small.
# ─────────────────────────────────────────────────────────────────────────

locals {
  ecr_repositories = ["backend", "frontend"]
}

resource "aws_ecr_repository" "app" {
  for_each = toset(local.ecr_repositories)

  name                 = "${var.project_name}-${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # allows `terraform destroy` even with images present

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-${each.key}"
  }
}

# Keep only the 10 most recent images; expire untagged ones after 7 days.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images older than 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the 10 most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = { type = "expire" }
      }
    ]
  })
}
