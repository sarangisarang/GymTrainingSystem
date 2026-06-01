output "vpc_id" {
  description = "ID of the foundation VPC."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets (one per AZ)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "IDs of the private subnets (one per AZ)."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for the (future) load balancer."
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group ID for the (future) application tasks."
  value       = aws_security_group.app.id
}

output "db_security_group_id" {
  description = "Security group ID for the (future) database."
  value       = aws_security_group.db.id
}

output "ecr_repository_urls" {
  description = "Map of ECR repository URLs (backend/frontend) for CI to push to."
  value       = { for k, repo in aws_ecr_repository.app : k => repo.repository_url }
}
