using Microsoft.EntityFrameworkCore;
using Favigon.Domain.Entities;

namespace Favigon.Infrastructure.Context;

public class FavigonDbContext : Microsoft.EntityFrameworkCore.DbContext
{
    public FavigonDbContext(DbContextOptions<FavigonDbContext> options)
        : base(options)
    {
    }

    // DbSets
    public DbSet<User> Users { get; set; }
    public DbSet<LinkedAccount> LinkedAccounts { get; set; }
    public DbSet<Project> Projects { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();

        modelBuilder.Entity<User>()
            .ToTable("users");

        modelBuilder.Entity<User>()
            .Property(u => u.CreatedAt)
            .HasDefaultValueSql("NOW()")
            .ValueGeneratedOnAdd();

        modelBuilder.Entity<User>()
            .HasMany(u => u.Projects)
            .WithOne(p => p.User)
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<User>()
            .HasMany(u => u.LinkedAccounts)
            .WithOne(la => la.User)
            .HasForeignKey(la => la.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<User>()
            .Property(u => u.PasswordResetTokenHash)
            .HasColumnName("password_reset_token_hash")
            .HasMaxLength(64);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.PasswordResetTokenHash)
            .IsUnique()
            .HasFilter("password_reset_token_hash IS NOT NULL");

        modelBuilder.Entity<User>()
            .Property(u => u.PasswordResetExpiresAt)
            .HasColumnName("password_reset_expires_at");

        modelBuilder.Entity<LinkedAccount>()
            .ToTable("linked_accounts");

        modelBuilder.Entity<LinkedAccount>()
            .HasIndex(la => new { la.Provider, la.ProviderUserId })
            .IsUnique();

        modelBuilder.Entity<LinkedAccount>()
            .HasIndex(la => new { la.UserId, la.Provider })
            .IsUnique();

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.Provider)
            .HasMaxLength(50);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.ProviderUserId)
            .HasMaxLength(255);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.ProviderEmail)
            .HasMaxLength(100);

        modelBuilder.Entity<LinkedAccount>()
            .Property(la => la.CreatedAt)
            .HasDefaultValueSql("NOW()")
            .ValueGeneratedOnAdd();

        modelBuilder.Entity<Project>()
            .ToTable("projects");

        modelBuilder.Entity<Project>()
            .Property(p => p.CreatedAt)
            .HasDefaultValueSql("NOW()")
            .ValueGeneratedOnAdd();

        modelBuilder.Entity<Project>()
            .Property(p => p.UpdatedAt)
            .HasDefaultValueSql("NOW()")
            .ValueGeneratedOnAddOrUpdate();

        modelBuilder.Entity<Project>()
            .Property(p => p.DesignJson)
            .HasColumnType("jsonb")
            .HasDefaultValue("{}");
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
