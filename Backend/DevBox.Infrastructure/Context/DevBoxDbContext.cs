using Microsoft.EntityFrameworkCore;
using DevBox.Domain.Entities;

namespace DevBox.Infrastructure.Context;

public class DevBoxDbContext : DbContext
{
    public DevBoxDbContext(DbContextOptions<DevBoxDbContext> options)
        : base(options)
    {
    }

    // DbSets
    public DbSet<User> Users { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>()
            .HasIndex(u => u.Email)
            .IsUnique();
    }
}
