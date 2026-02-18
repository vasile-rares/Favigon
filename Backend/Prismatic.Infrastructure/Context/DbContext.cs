using Microsoft.EntityFrameworkCore;
using Prismatic.Domain.Entities;

namespace Prismatic.Infrastructure.Context;

public class PrismaticDbContext : Microsoft.EntityFrameworkCore.DbContext
{
    public PrismaticDbContext(DbContextOptions<PrismaticDbContext> options)
        : base(options)
    {
    }

    // DbSets
    public DbSet<User> Users { get; set; }
    public DbSet<Project> Projects { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<User>()
            .Property(u => u.CreatedAt)
            .HasDefaultValueSql("GETUTCDATE()")
            .ValueGeneratedOnAdd();

      modelBuilder.Entity<User>()
          .HasMany(u => u.Projects)
          .WithOne(p => p.User)
          .HasForeignKey(p => p.UserId)
          .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Project>()
            .Property(p => p.CreatedAt)
            .HasDefaultValueSql("GETUTCDATE()")
            .ValueGeneratedOnAdd();

        modelBuilder.Entity<Project>()
            .Property(p => p.UpdatedAt)
            .HasDefaultValueSql("GETUTCDATE()")
            .ValueGeneratedOnAddOrUpdate();
    }

    public override int SaveChanges()
    {
        ApplyTimestamps();
        return base.SaveChanges();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        ApplyTimestamps();
        return base.SaveChangesAsync(cancellationToken);
    }

    private void ApplyTimestamps()
    {
        var utcNow = DateTime.UtcNow;

        foreach (var entry in ChangeTracker.Entries())
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Metadata.FindProperty("CreatedAt") != null)
                {
                    var createdAt = entry.Property("CreatedAt");
                    if (createdAt.CurrentValue == null ||
                        (createdAt.CurrentValue is DateTime dt && dt == default))
                    {
                        createdAt.CurrentValue = utcNow;
                    }
                }

                if (entry.Metadata.FindProperty("UpdatedAt") != null)
                {
                    entry.Property("UpdatedAt").CurrentValue = utcNow;
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                if (entry.Metadata.FindProperty("UpdatedAt") != null)
                {
                    var updatedAt = entry.Property("UpdatedAt");
                    updatedAt.CurrentValue = utcNow;
                    updatedAt.IsModified = true;
                }
            }
        }
    }
}
