using Favigon.Infrastructure.Context;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Favigon.Infrastructure.Migrations
{
  [DbContext(typeof(FavigonDbContext))]
  [Migration("20260412130000_AddHasPasswordFlag")]
  public partial class AddHasPasswordFlag : Migration
  {
    protected override void Up(MigrationBuilder migrationBuilder)
    {
      migrationBuilder.AddColumn<bool>(
          name: "HasPassword",
          table: "users",
          type: "boolean",
          nullable: false,
          defaultValue: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
      migrationBuilder.DropColumn(
          name: "HasPassword",
          table: "users");
    }
  }
}