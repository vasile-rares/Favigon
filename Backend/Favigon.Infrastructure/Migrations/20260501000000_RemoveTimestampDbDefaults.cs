using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
  public partial class RemoveTimestampDbDefaults : Migration
  {
    protected override void Up(MigrationBuilder migrationBuilder)
    {
      // Remove DB-level DEFAULT NOW() from all timestamp columns.
      // Timestamps are set exclusively by FavigonDbContext.ApplyTimestamps() in C# before
      // every SaveChanges call, so the DB defaults were redundant. Removing them also
      // eliminates the RETURNING round-trip that EF Core adds for ValueGeneratedOnAdd/
      // ValueGeneratedOnAddOrUpdate properties after each INSERT/UPDATE.

      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "users",
          type: "timestamp with time zone",
          nullable: false,
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone",
          oldDefaultValueSql: "NOW()");

      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "linked_accounts",
          type: "timestamp with time zone",
          nullable: false,
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone",
          oldDefaultValueSql: "NOW()");

      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "projects",
          type: "timestamp with time zone",
          nullable: false,
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone",
          oldDefaultValueSql: "NOW()");

      migrationBuilder.AlterColumn<DateTime>(
          name: "UpdatedAt",
          table: "projects",
          type: "timestamp with time zone",
          nullable: false,
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone",
          oldDefaultValueSql: "NOW()");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "users",
          type: "timestamp with time zone",
          nullable: false,
          defaultValueSql: "NOW()",
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone");

      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "linked_accounts",
          type: "timestamp with time zone",
          nullable: false,
          defaultValueSql: "NOW()",
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone");

      migrationBuilder.AlterColumn<DateTime>(
          name: "CreatedAt",
          table: "projects",
          type: "timestamp with time zone",
          nullable: false,
          defaultValueSql: "NOW()",
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone");

      migrationBuilder.AlterColumn<DateTime>(
          name: "UpdatedAt",
          table: "projects",
          type: "timestamp with time zone",
          nullable: false,
          defaultValueSql: "NOW()",
          oldClrType: typeof(DateTime),
          oldType: "timestamp with time zone");
    }
  }
}
